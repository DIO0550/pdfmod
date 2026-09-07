import { NumberEx } from "../../../ext/number/index";
import type { PdfError } from "../../../pdf/errors/error/index";
import type {
  PdfWarning,
  PdfWarningCode,
} from "../../../pdf/errors/warning/index";
import { IndirectRef } from "../../../pdf/types/indirect-ref/index";
import type {
  PdfDictionary,
  PdfIndirectRef,
  PdfValue,
} from "../../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { ResolveRef } from "../../catalog/catalog-parser";
import { DictReader } from "../dict-reader";
import {
  InheritanceResolver,
  type InheritedAttrs,
} from "../inheritance-resolver";
import type { PdfRectangle, ResolvedPage } from "../resolved-page";
import { type ResolveValueContext, ValueResolver } from "../value-resolver";

/** `PageTreeWalker.walk` の出力。 */
export interface WalkPageTreeResult {
  pages: ResolvedPage[];
  warnings: PdfWarning[];
}

// PDF仕様上の明示的な上限はなく、ページツリーの循環参照検出のための防御的な上限値。
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

/** ノード 1 つ分の読み取り文脈。 */
interface ReadContext {
  /** `${objectNumber}-${generationNumber}` 形式のノードキー（警告メッセージ用） */
  nodeKey: string;
  /** 間接参照解決関数 */
  resolveRef: ResolveRef;
  /** 警告の蓄積先（mutable 参照） */
  warnings: PdfWarning[];
}

/**
 * `ReadContext` から `ValueResolver` 用の文脈を組み立てる。
 *
 * @param ctx - 読み取り文脈
 * @param key - 辞書キー名
 * @param warningCode - 解決失敗時の警告コード
 * @returns ValueResolver 用文脈
 */
const resolveContext = (
  ctx: ReadContext,
  key: string,
  warningCode: PdfWarningCode,
): ResolveValueContext => ({
  key,
  resolveRef: ctx.resolveRef,
  warnings: ctx.warnings,
  warningCode,
});

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
 * `/Kids` を解析する。値自体が間接参照なら 1 段解決してから配列として扱う
 * （要素は子ノードへの参照なので解決しない）。
 * - キー不在 → `missing`
 * - 解決失敗 / 配列でない → `invalid-array`
 * - 配列のとき → `ok`（indirect-ref のみ抽出 + 非 ref 要素数を返す）
 *
 * @param entries - 辞書エントリ
 * @param ctx - 読み取り文脈
 * @returns 解析結果
 */
const getKidsRefs = async (
  entries: Map<string, PdfValue>,
  ctx: ReadContext,
): Promise<KidsRefsResult> => {
  const value = entries.get("Kids");
  if (value === undefined) {
    return { kind: "missing" };
  }
  const resolved = await ValueResolver.value(
    value,
    resolveContext(ctx, "Kids", "PAGE_ATTR_RESOLVE_FAILED"),
  );
  if (!resolved.some || resolved.value.type !== "array") {
    return { kind: "invalid-array" };
  }
  const refs: PdfIndirectRef[] = [];
  let invalidElementCount = 0;
  for (const el of resolved.value.elements) {
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
 * @returns 非負整数、または Option.none
 */
const readCount = (entries: Map<string, PdfValue>): Option<number> => {
  const value = entries.get("Count");
  if (value === undefined || value.type !== "integer") {
    return none;
  }
  if (!NumberEx.isSafeIntegerAtLeastZero(value.value)) {
    return none;
  }
  return some(value.value);
};

/**
 * `/Resources` を取得する。間接参照なら resolveRef で 1 段解決する。
 * 解決失敗 (Err / non-dict) の場合は `RESOURCES_RESOLVE_FAILED` 警告を積み
 * Option.none を返す（属性未設定 + 走査継続）。
 *
 * @param entries - 辞書エントリ
 * @param resolveRef - 間接参照解決関数
 * @param warnings - 警告蓄積先
 * @returns 解決済み Option.some(PdfDictionary)、または Option.none
 */
const resolveResources = async (
  entries: Map<string, PdfValue>,
  ctx: ReadContext,
): Promise<Option<PdfDictionary>> => {
  const value = entries.get("Resources");
  if (value === undefined) {
    return none;
  }
  if (value.type === "dictionary") {
    return some(value);
  }
  if (value.type !== "indirect-ref") {
    ctx.warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources: unexpected direct type=${value.type}`,
    });
    return none;
  }
  const resolved = await ValueResolver.value(
    value,
    resolveContext(ctx, "Resources", "RESOURCES_RESOLVE_FAILED"),
  );
  if (!resolved.some) {
    return none;
  }
  if (resolved.value.type !== "dictionary") {
    ctx.warnings.push({
      code: "RESOURCES_RESOLVE_FAILED",
      message: `Failed to resolve /Resources indirect-ref ${value.objectNumber} ${value.generationNumber}: resolved to non-dictionary`,
    });
    return none;
  }
  return some(resolved.value);
};

/**
 * `/MediaBox` / `/CropBox` を読み取る。間接参照は値・配列要素とも 1 段解決する。
 * 値は取れたが矩形として無効な場合は警告を積み、局所値なしとして扱う
 * （呼び出し側で継承値へフォールバックする）。
 *
 * @param entries - 辞書エントリ
 * @param key - 読み取るキー名
 * @param invalidCode - 値が矩形として無効なときに積む警告コード
 * @param ctx - 読み取り文脈
 * @returns 有効な矩形なら Some、それ以外 None
 */
const readBox = async (
  entries: Map<string, PdfValue>,
  key: "MediaBox" | "CropBox",
  invalidCode: PdfWarningCode,
  ctx: ReadContext,
): Promise<Option<PdfRectangle>> => {
  const raw = entries.get(key);
  if (raw === undefined) {
    return none;
  }
  const resolved = await ValueResolver.valueWithElements(
    raw,
    resolveContext(ctx, key, "PAGE_ATTR_RESOLVE_FAILED"),
  );
  if (!resolved.some) {
    return none;
  }
  const box = DictReader.box(resolved.value);
  if (!box.some) {
    ctx.warnings.push({
      code: invalidCode,
      message: `Node ${ctx.nodeKey}: /${key} is not a valid 4-number array, ignoring local value`,
    });
  }
  return box;
};

/**
 * `/Rotate` を読み取る。間接参照は 1 段解決する。
 * 値は取れたが数値でない場合は `INVALID_ROTATE` を積み、局所値なしとして扱う。
 *
 * @param entries - 辞書エントリ
 * @param ctx - 読み取り文脈
 * @returns 数値なら Some、それ以外 None
 */
const readRotate = async (
  entries: Map<string, PdfValue>,
  ctx: ReadContext,
): Promise<Option<number>> => {
  const raw = entries.get("Rotate");
  if (raw === undefined) {
    return none;
  }
  const resolved = await ValueResolver.value(
    raw,
    resolveContext(ctx, "Rotate", "PAGE_ATTR_RESOLVE_FAILED"),
  );
  if (!resolved.some) {
    return none;
  }
  const rotate = DictReader.rotate(resolved.value);
  if (!rotate.some) {
    ctx.warnings.push({
      code: "INVALID_ROTATE",
      message: `Node ${ctx.nodeKey}: /Rotate is not a number, ignoring local value`,
    });
  }
  return rotate;
};

/**
 * `/Pages` または `/Page` ノードから継承可能 4 属性を読み取る。
 * 4 属性とも indirect-ref を 1 段解決する（`/MediaBox` `/CropBox` は配列要素も）。
 * 解決失敗・値不正はいずれも警告を積んだうえで属性未設定として返し、
 * 呼び出し側で祖先の継承値へフォールバックさせる。
 *
 * @param entries - 辞書エントリ
 * @param ctx - 読み取り文脈
 * @returns 事前解決済みの継承可能属性
 */
const readInheritableAttrs = async (
  entries: Map<string, PdfValue>,
  ctx: ReadContext,
): Promise<InheritedAttrs> => {
  const attrs: InheritedAttrs = {};
  const mediaBox = await readBox(entries, "MediaBox", "INVALID_MEDIABOX", ctx);
  if (mediaBox.some) {
    attrs.mediaBox = mediaBox.value;
  }
  const cropBox = await readBox(entries, "CropBox", "INVALID_CROPBOX", ctx);
  if (cropBox.some) {
    attrs.cropBox = cropBox.value;
  }
  const rotate = await readRotate(entries, ctx);
  if (rotate.some) {
    attrs.rotate = rotate.value;
  }
  const resourcesOpt = await resolveResources(entries, ctx);
  if (resourcesOpt.some) {
    attrs.resources = resourcesOpt.value;
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

  const readCtx: ReadContext = {
    nodeKey: key,
    resolveRef,
    warnings: state.warnings,
  };

  if (kind === "page") {
    const pageLeaf = await readInheritableAttrs(dict.entries, readCtx);
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

  const localAttrs = await readInheritableAttrs(dict.entries, readCtx);
  const nextStack: InheritedAttrs = {
    mediaBox: localAttrs.mediaBox ?? stack.mediaBox,
    resources: localAttrs.resources ?? stack.resources,
    cropBox: localAttrs.cropBox ?? stack.cropBox,
    rotate: localAttrs.rotate ?? stack.rotate,
  };

  const kids = await getKidsRefs(dict.entries, readCtx);
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
    const indirectRef = IndirectRef.from(rawKid);
    if (!indirectRef.some) {
      state.warnings.push({
        code: "UNKNOWN_PAGE_TYPE",
        message: `Invalid /Kids entry in ${key}: invalid indirect reference (object and/or generation)`,
      });
      continue;
    }
    const before = state.pages.length;
    const childResult = await walkInternal(
      indirectRef.value,
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

  const declaredOpt = readCount(dict.entries);
  if (declaredOpt.some && declaredOpt.value !== actualCount) {
    state.warnings.push({
      code: "COUNT_MISMATCH",
      message: `Pages node ${key}: /Count ${declaredOpt.value} but ${actualCount} pages found`,
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
   * @returns 成功時は `Ok<WalkPageTreeResult>`、MediaBox 未継承 / resolver Err 時は `Err<PdfError>`
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
