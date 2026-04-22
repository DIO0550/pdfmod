import { expect, type Mock, vi } from "vitest";
import type { PdfError } from "../../pdf/errors/error/index";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../pdf/types/object-number/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfIndirectRef,
  PdfObject,
  PdfValue,
} from "../../pdf/types/pdf-types/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import type { ResolveRef } from "../catalog-parser";

/**
 * Result が Ok であることを `expect` で保証し、値を返す（テスト専用ヘルパ）。
 *
 * @param result - 検査対象
 * @returns 成功値
 */
export const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
};

/**
 * Result が Err であることを `expect` で保証し、エラーを返す（テスト専用ヘルパ）。
 *
 * @param result - 検査対象
 * @returns エラー値
 */
export const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

/**
 * ブランド付き `IndirectRef` を手軽に作るヘルパ。
 *
 * @param objNum - オブジェクト番号
 * @param genNum - 世代番号（既定: 0）
 * @returns 構築された IndirectRef
 */
export const makeRef = (objNum: number, genNum = 0): IndirectRef => ({
  objectNumber: ObjectNumber.of(objNum),
  generationNumber: GenerationNumber.of(genNum),
});

/**
 * PdfValue の indirect-ref 形式（辞書エントリ内で使う）を作る。
 *
 * @param objNum - オブジェクト番号
 * @param genNum - 世代番号（既定: 0）
 * @returns PdfIndirectRef
 */
export const indirectRefValue = (
  objNum: number,
  genNum = 0,
): PdfIndirectRef => ({
  type: "indirect-ref",
  objectNumber: objNum,
  generationNumber: genNum,
});

/**
 * エントリマップから `PdfDictionary` を作る。
 *
 * @param entries - 辞書エントリ
 * @returns 構築された PdfDictionary
 */
export const okDict = (entries: Map<string, PdfValue>): PdfDictionary => ({
  type: "dictionary",
  entries,
});

/**
 * `number[]` を PdfValue 配列（PdfInteger 要素）に変換する。
 *
 * @param values - 数値配列
 * @returns PdfArray 形式の PdfValue
 */
export const makeNumberArray = (values: number[]): PdfValue => ({
  type: "array",
  elements: values.map((v) => ({ type: "integer", value: v })),
});

/**
 * `makePagesDict` のオプション。
 */
export interface MakePagesDictOptions {
  kids?: IndirectRef[];
  count?: number;
  mediaBox?: [number, number, number, number];
  resources?: PdfDictionary;
  resourcesRef?: IndirectRef;
  cropBox?: [number, number, number, number];
  rotate?: PdfValue;
  type?: PdfValue;
}

/**
 * `/Pages` 辞書を部分的に組み立てる。
 *
 * @param opts - 設定オプション
 * @returns 構築された PdfDictionary
 */
export const makePagesDict = (opts: MakePagesDictOptions): PdfDictionary => {
  const entries = new Map<string, PdfValue>();
  entries.set("Type", opts.type ?? { type: "name", value: "Pages" });
  if (opts.kids !== undefined) {
    entries.set("Kids", {
      type: "array",
      elements: opts.kids.map((r) =>
        indirectRefValue(r.objectNumber, r.generationNumber),
      ),
    });
  }
  if (opts.count !== undefined) {
    entries.set("Count", { type: "integer", value: opts.count });
  }
  if (opts.mediaBox !== undefined) {
    entries.set("MediaBox", makeNumberArray(opts.mediaBox));
  }
  if (opts.resources !== undefined) {
    entries.set("Resources", opts.resources);
  }
  if (opts.resourcesRef !== undefined) {
    entries.set(
      "Resources",
      indirectRefValue(
        opts.resourcesRef.objectNumber,
        opts.resourcesRef.generationNumber,
      ),
    );
  }
  if (opts.cropBox !== undefined) {
    entries.set("CropBox", makeNumberArray(opts.cropBox));
  }
  if (opts.rotate !== undefined) {
    entries.set("Rotate", opts.rotate);
  }
  return okDict(entries);
};

/**
 * `makePageDict` のオプション。
 */
export interface MakePageDictOptions {
  mediaBox?: [number, number, number, number];
  resources?: PdfDictionary;
  resourcesRef?: IndirectRef;
  cropBox?: [number, number, number, number];
  rotate?: PdfValue;
  contents?: PdfValue;
  annots?: PdfValue;
  userUnit?: PdfValue;
  type?: PdfValue;
  noType?: boolean;
}

/**
 * `/Page` 辞書を部分的に組み立てる。
 *
 * @param opts - 設定オプション
 * @returns 構築された PdfDictionary
 */
export const makePageDict = (opts: MakePageDictOptions = {}): PdfDictionary => {
  const entries = new Map<string, PdfValue>();
  if (opts.noType !== true) {
    entries.set("Type", opts.type ?? { type: "name", value: "Page" });
  }
  if (opts.mediaBox !== undefined) {
    entries.set("MediaBox", makeNumberArray(opts.mediaBox));
  }
  if (opts.resources !== undefined) {
    entries.set("Resources", opts.resources);
  }
  if (opts.resourcesRef !== undefined) {
    entries.set(
      "Resources",
      indirectRefValue(
        opts.resourcesRef.objectNumber,
        opts.resourcesRef.generationNumber,
      ),
    );
  }
  if (opts.cropBox !== undefined) {
    entries.set("CropBox", makeNumberArray(opts.cropBox));
  }
  if (opts.rotate !== undefined) {
    entries.set("Rotate", opts.rotate);
  }
  if (opts.contents !== undefined) {
    entries.set("Contents", opts.contents);
  }
  if (opts.annots !== undefined) {
    entries.set("Annots", opts.annots);
  }
  if (opts.userUnit !== undefined) {
    entries.set("UserUnit", opts.userUnit);
  }
  return okDict(entries);
};

/**
 * `${objNum}-${genNum}` 形式のキーで PdfObject を引ける Map から `ResolveRef` を作る。
 *
 * @param map - 参照先オブジェクトのマップ
 * @returns ResolveRef 実装
 */
export const makeResolverMap = (map: Map<string, PdfObject>): ResolveRef => {
  return async (ref: IndirectRef) => {
    const key = `${ref.objectNumber}-${ref.generationNumber}`;
    const obj = map.get(key);
    if (obj === undefined) {
      return err({
        code: "CIRCULAR_REFERENCE",
        message: `No object for ${key}`,
        objectId: ref,
      });
    }
    return ok(obj);
  };
};

type ResolverImpl = (ref: IndirectRef) => Promise<Result<PdfObject, PdfError>>;

/**
 * `ResolveRef` の vi.fn ラッパ。
 *
 * @param impl - 実装
 * @returns vitest Mock インスタンス
 */
export const makeResolverStub = (impl: ResolverImpl): Mock<ResolveRef> =>
  vi.fn(impl);

/**
 * 特定 ref でのみ Err を返すスタブ（RESOURCES_RESOLVE_FAILED テスト用）。
 * 他の ref は渡された成功マップから解決する。
 *
 * @param failingKey - Err を返すキー（`${objNum}-${genNum}` 形式）
 * @param error - 返す PdfError
 * @param successMap - 他のキーを解決する Map（省略時は空）
 * @returns ResolveRef 実装
 */
export const makeFailingResolver = (
  failingKey: string,
  error: PdfError,
  successMap: Map<string, PdfObject> = new Map(),
): ResolveRef => {
  return async (ref: IndirectRef) => {
    const key = `${ref.objectNumber}-${ref.generationNumber}`;
    if (key === failingKey) {
      return err(error);
    }
    const obj = successMap.get(key);
    if (obj === undefined) {
      return err({
        code: "CIRCULAR_REFERENCE",
        message: `No object for ${key}`,
        objectId: ref,
      });
    }
    return ok(obj);
  };
};
