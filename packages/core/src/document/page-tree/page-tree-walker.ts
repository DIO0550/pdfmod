import { NumberEx } from "../../ext/number/index";
import type { PdfError } from "../../pdf/errors/error/index";
import type { PdfWarning } from "../../pdf/errors/warning/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfIndirectRef,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";
import { err, ok, type Result } from "../../utils/result/index";
import type { ResolveRef } from "../catalog-parser";
import {
  InheritanceResolver,
  InheritanceResolverHelpers,
  type InheritedAttrs,
} from "./inheritance-resolver";
import type { ResolvedPage } from "./resolved-page";

/** `PageTreeWalker.walk` の出力。 */
export interface WalkPageTreeResult {
  pages: ResolvedPage[];
  warnings: PdfWarning[];
}

const MAX_TREE_DEPTH = 50;

const DISPATCH_PAGES = "Pages";
const DISPATCH_PAGE = "Page";

interface WalkState {
  pages: ResolvedPage[];
  warnings: PdfWarning[];
  visited: Set<string>;
}

/**
 * `${objectNumber}-${generationNumber}` 形式の visited キーを生成する。
 *
 * @param ref - ブランド付き IndirectRef
 * @returns visited キー
 */
const visitedKey = (ref: IndirectRef): string =>
  `${ref.objectNumber}-${ref.generationNumber}`;

/**
 * `/Type` name 値を読み取り、Walker の分岐ラベルに変換する。
 *
 * @param entries - 辞書エントリ
 * @returns "pages" / "page" / "unknown"
 */
const dispatchType = (
  entries: Map<string, PdfValue>,
): "pages" | "page" | "unknown" => {
  const typeValue = entries.get("Type");
  if (typeValue === undefined || typeValue.type !== "name") {
    return "unknown";
  }
  if (typeValue.value === DISPATCH_PAGES) {
    return "pages";
  }
  if (typeValue.value === DISPATCH_PAGE) {
    return "page";
  }
  return "unknown";
};

const toBrandedRef = InheritanceResolverHelpers.toBrandedRef;

/** `/Kids` の解析結果。 */
type KidsRefsResult =
  | { kind: "missing" }
  | { kind: "invalid-array" }
  | {
      kind: "ok";
      refs: PdfIndirectRef[];
      invalidElementCount: number;
    };

/**
 * `/Kids` を解析する。
 * - キー不在 → `missing`
 * - キーが存在するが配列でない → `invalid-array`
 * - 配列のとき → `ok`（indirect-ref のみ抽出 + 非 ref 要素数を返す）
 *
 * @param entries - 辞書エントリ
 * @returns 解析結果
 */
const getKidsRefs = (entries: Map<string, PdfValue>): KidsRefsResult => {
  const value = entries.get("Kids");
  if (value === undefined) {
    return { kind: "missing" };
  }
  if (value.type !== "array") {
    return { kind: "invalid-array" };
  }
  const refs: PdfIndirectRef[] = [];
  let invalidElementCount = 0;
  for (const el of value.elements) {
    if (el.type === "indirect-ref") {
      refs.push(el);
    } else {
      invalidElementCount += 1;
    }
  }
  return { kind: "ok", refs, invalidElementCount };
};

/**
 * `/Count` を非負整数として取り出す。
 *
 * @param entries - 辞書エントリ
 * @returns 非負整数、または undefined
 */
const readCount = (entries: Map<string, PdfValue>): number | undefined => {
  const value = entries.get("Count");
  if (value === undefined || value.type !== "integer") {
    return undefined;
  }
  if (!NumberEx.isSafeIntegerAtLeastZero(value.value)) {
    return undefined;
  }
  return value.value;
};

/**
 * `/Resources` を取得する。間接参照なら resolveRef で 1 段解決する。
 * 解決失敗 (Err / non-dict) の場合は `RESOURCES_RESOLVE_FAILED` 警告を積み
 * undefined を返す（属性未設定 + 走査継続）。
 *
 * @param entries - 辞書エントリ
 * @param resolveRef - 間接参照解決関数
 * @param warnings - 警告蓄積先
 * @returns 解決済み PdfDictionary、または undefined
 */
const resolveResources = async (
  entries: Map<string, PdfValue>,
  resolveRef: ResolveRef,
  warnings: PdfWarning[],
): Promise<PdfDictionary | undefined> => {
  const value = entries.get("Resources");
  if (value === undefined) {
    return undefined;
  }
  if (value.type === "dictionary") {
    return value;
  }
  if (value.type !== "indirect-ref") {
    warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources: unexpected direct type=${value.type}`,
    });
    return undefined;
  }
  const branded = toBrandedRef(value);
  if (branded === undefined) {
    warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources indirect-ref ${value.objectNumber} ${value.generationNumber}: invalid object number`,
    });
    return undefined;
  }
  const resolved = await resolveRef(branded);
  if (!resolved.ok) {
    warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources indirect-ref ${value.objectNumber} ${value.generationNumber}: cause=${resolved.error.code}`,
    });
    return undefined;
  }
  if (resolved.value.type !== "dictionary") {
    warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources indirect-ref ${value.objectNumber} ${value.generationNumber}: resolved to non-dictionary`,
    });
    return undefined;
  }
  return resolved.value;
};

/**
 * `/Pages` または `/Page` ノードから継承可能 4 属性を読み取る。
 * `/Resources` のみ indirect-ref を 1 段解決する（Resources 解決失敗は警告積み + undefined）。
 * `/Rotate` はキー存在かつ数値のときだけ生値を詰める（非数値は Resolver 側で判定）。
 *
 * @param entries - 辞書エントリ
 * @param resolveRef - 間接参照解決関数
 * @param warnings - 警告蓄積先
 * @returns 事前解決済みの継承可能属性
 */
const readInheritableAttrs = async (
  entries: Map<string, PdfValue>,
  resolveRef: ResolveRef,
  warnings: PdfWarning[],
): Promise<InheritedAttrs> => {
  const attrs: InheritedAttrs = {};
  const mediaBox = InheritanceResolverHelpers.readBoxFromDict(
    entries,
    "MediaBox",
  );
  if (mediaBox.some) {
    attrs.mediaBox = mediaBox.value;
  }
  const cropBox = InheritanceResolverHelpers.readBoxFromDict(
    entries,
    "CropBox",
  );
  if (cropBox.some) {
    attrs.cropBox = cropBox.value;
  }
  const rotate = InheritanceResolverHelpers.readRotateFromDict(entries);
  if (rotate.some) {
    attrs.rotate = rotate.value;
  }
  const resources = await resolveResources(entries, resolveRef, warnings);
  if (resources !== undefined) {
    attrs.resources = resources;
  }
  return attrs;
};

/**
 * 再帰本体。None = 正常 / 警告スキップ、Some(PdfError) = fatal 伝播。
 * `state` は mutable 参照で共有する。
 *
 * @param ref - 訪問先の参照
 * @param stack - 祖先から積み上げた継承属性
 * @param depth - 現在の深度
 * @param state - 共有走査状態
 * @param resolveRef - 間接参照解決関数
 * @returns fatal なら Some、正常 / スキップは None
 */
const walkInternal = async (
  ref: IndirectRef,
  stack: InheritedAttrs,
  depth: number,
  state: WalkState,
  resolveRef: ResolveRef,
): Promise<Option<PdfError>> => {
  if (depth > MAX_TREE_DEPTH) {
    state.warnings.push({
      code: "PAGE_TREE_TOO_DEEP",
      message: `Page tree depth exceeds ${MAX_TREE_DEPTH}`,
    });
    return none;
  }

  const key = visitedKey(ref);
  if (state.visited.has(key)) {
    state.warnings.push({
      code: "PAGE_TREE_CYCLE",
      message: `Cycle detected at ${key}`,
    });
    return none;
  }
  state.visited.add(key);

  const resolved = await resolveRef(ref);
  if (!resolved.ok) {
    return some(resolved.error);
  }

  if (resolved.value.type !== "dictionary") {
    state.warnings.push({
      code: "UNKNOWN_PAGE_TYPE",
      message: `Node ${key} is not a dictionary`,
    });
    return none;
  }

  const dict = resolved.value;
  const kind = dispatchType(dict.entries);

  if (kind === "unknown") {
    state.warnings.push({
      code: "UNKNOWN_PAGE_TYPE",
      message: `Node ${key} has unknown /Type`,
    });
    return none;
  }

  if (kind === "page") {
    const pageLeaf = await readInheritableAttrs(
      dict.entries,
      resolveRef,
      state.warnings,
    );
    const resolveResult = InheritanceResolver.resolve(
      dict,
      stack,
      pageLeaf,
      ref,
    );
    if (!resolveResult.ok) {
      return some(resolveResult.error);
    }
    state.pages.push(resolveResult.value.page);
    state.warnings.push(...resolveResult.value.warnings);
    return none;
  }

  const localAttrs = await readInheritableAttrs(
    dict.entries,
    resolveRef,
    state.warnings,
  );
  const nextStack: InheritedAttrs = {
    mediaBox: localAttrs.mediaBox ?? stack.mediaBox,
    resources: localAttrs.resources ?? stack.resources,
    cropBox: localAttrs.cropBox ?? stack.cropBox,
    rotate: localAttrs.rotate ?? stack.rotate,
  };

  const kids = getKidsRefs(dict.entries);
  if (kids.kind === "missing") {
    state.warnings.push({
      code: "MISSING_KIDS",
      message: `Pages node ${key} missing /Kids`,
    });
    return none;
  }
  if (kids.kind === "invalid-array") {
    state.warnings.push({
      code: "MISSING_KIDS",
      message: `Pages node ${key} has /Kids but it is not an array`,
    });
    return none;
  }

  for (let i = 0; i < kids.invalidElementCount; i += 1) {
    state.warnings.push({
      code: "UNKNOWN_PAGE_TYPE",
      message: `Invalid /Kids entry in ${key}: not an indirect-ref`,
    });
  }

  let actualCount = 0;
  for (const rawKid of kids.refs) {
    const branded = toBrandedRef(rawKid);
    if (branded === undefined) {
      state.warnings.push({
        code: "UNKNOWN_PAGE_TYPE",
        message: `Invalid /Kids entry in ${key}: bad object number`,
      });
      continue;
    }
    const before = state.pages.length;
    const childResult = await walkInternal(
      branded,
      nextStack,
      depth + 1,
      state,
      resolveRef,
    );
    if (childResult.some) {
      return childResult;
    }
    actualCount += state.pages.length - before;
  }

  const declared = readCount(dict.entries);
  if (declared !== undefined && declared !== actualCount) {
    state.warnings.push({
      code: "COUNT_MISMATCH",
      message: `Pages node ${key}: /Count ${declared} but ${actualCount} pages found`,
    });
  }

  return none;
};

/**
 * PDF ページツリーを DFS で走査し `ResolvedPage[]` を構築するユーティリティ。
 * ISO 32000-2:2020 § 7.7.3.3 Page tree 準拠。
 */
export const PageTreeWalker = {
  /**
   * ルート参照から再帰走査してページ群と警告を返す。
   *
   * @param rootRef - ページツリーのルート参照（CatalogParser.parse().pagesRef）
   * @param resolveRef - 間接参照解決関数
   * @returns 成功時は `Ok<WalkPageTreeResult>`、IH-003 / resolver Err 時は `Err<PdfError>`
   */
  async walk(
    rootRef: IndirectRef,
    resolveRef: ResolveRef,
  ): Promise<Result<WalkPageTreeResult, PdfError>> {
    const state: WalkState = {
      pages: [],
      warnings: [],
      visited: new Set(),
    };
    const result = await walkInternal(rootRef, {}, 0, state, resolveRef);
    if (result.some) {
      return err(result.value);
    }
    return ok({ pages: state.pages, warnings: state.warnings });
  },
} as const;
