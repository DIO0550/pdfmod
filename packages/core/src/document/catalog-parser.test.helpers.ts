import { expect, type Mock, vi } from "vitest";
import type { PdfError } from "../pdf/errors/error/index";
import { GenerationNumber } from "../pdf/types/generation-number/index";
import { ObjectNumber } from "../pdf/types/object-number/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfValue,
  TrailerDict,
} from "../pdf/types/pdf-types/index";
import { PdfVersion } from "../pdf/version/index";
import type { Result } from "../utils/result/index";
import type { ResolveRef } from "./catalog-parser";

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
 * `PdfVersion.create` の成功を保証して値を返すショートカット。
 *
 * @param s - `major.minor` 形式の文字列
 * @returns 構築された PdfVersion
 */
export const pdfVersion = (s: string): PdfVersion =>
  unwrapOk(PdfVersion.create(s));

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
 * エントリマップから `PdfDictionary` を作るヘルパ。
 *
 * @param entries - 辞書エントリ
 * @returns 構築された PdfDictionary
 */
export const okDict = (entries: Map<string, PdfValue>): PdfDictionary => ({
  type: "dictionary",
  entries,
});

/**
 * カタログ辞書のエントリを部分的に組み立てるヘルパ。
 *
 * @param opts - `/Type` `/Pages` `/Version` の各 PdfValue
 * @returns 指定されたキーのみを含む Map
 */
export const makeCatalogEntries = (opts: {
  type?: PdfValue;
  pages?: PdfValue;
  version?: PdfValue;
}): Map<string, PdfValue> => {
  const entries = new Map<string, PdfValue>();

  if (opts.type !== undefined) {
    entries.set("Type", opts.type);
  }

  if (opts.pages !== undefined) {
    entries.set("Pages", opts.pages);
  }

  if (opts.version !== undefined) {
    entries.set("Version", opts.version);
  }

  return entries;
};

/**
 * 最小限の `TrailerDict` を組み立てるヘルパ。
 *
 * @param rootRef - `/Root` に設定する間接参照
 * @returns 構築された TrailerDict
 */
export const makeTrailerDict = (rootRef: IndirectRef): TrailerDict => ({
  root: rootRef,
  size: 10,
});

type ResolverImpl = (ref: IndirectRef) => Promise<Result<PdfObject, PdfError>>;

/**
 * `ResolveRef` のモックを生成するヘルパ。
 *
 * @param impl - 呼び出し時の挙動
 * @returns vitest の Mock インスタンス
 */
export const makeResolverStub = (impl: ResolverImpl): Mock<ResolveRef> =>
  vi.fn(impl);
