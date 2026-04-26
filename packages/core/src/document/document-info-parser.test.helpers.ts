import { expect } from "vitest";
import type { PdfError } from "../pdf/errors/error/index";
import { GenerationNumber } from "../pdf/types/generation-number/index";
import { ObjectNumber } from "../pdf/types/object-number/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfString,
  PdfValue,
  TrailerDict,
} from "../pdf/types/pdf-types/index";
import type { Result } from "../utils/result/index";

const BOM_BYTE_0 = 0xfe;
const BOM_BYTE_1 = 0xff;
const BYTES_PER_CHAR_CODE = 2;
const HIGH_BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;

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
 * `/Info` を含むトレーラ辞書を作る。
 *
 * @param info - `/Info` に設定する間接参照
 * @returns 構築された TrailerDict
 */
export const makeTrailerWithInfo = (info: IndirectRef): TrailerDict => ({
  root: makeRef(1),
  size: 10,
  info,
});

/**
 * `/Info` を含まないトレーラ辞書を作る。
 *
 * @returns 構築された TrailerDict
 */
export const makeTrailerNoInfo = (): TrailerDict => ({
  root: makeRef(1),
  size: 10,
});

/**
 * ASCII / Latin-1 範囲のテキストを literal byte 列で表現する。
 * 多言語は {@link utf16BeString} を使用すること。
 *
 * @param text - エンコード対象のテキスト
 * @returns PdfString
 */
export const literalString = (text: string): PdfString => ({
  type: "string",
  value: new TextEncoder().encode(text),
  encoding: "literal",
});

/**
 * UTF-16BE BOM 付き PdfString を生成する。
 *
 * `charCodeAt` をインデックスごとに呼ぶことで、サロゲートペア（補助平面文字 🚀 等）
 * を保持する（review-001 反映）。
 *
 * @param text - エンコード対象のテキスト
 * @returns BOM 付き UTF-16BE バイト列を持つ PdfString
 */
export const utf16BeString = (text: string): PdfString => {
  const codeUnits: number[] = [];
  for (let i = 0; i < text.length; i++) {
    codeUnits.push(text.charCodeAt(i));
  }
  const bytes = new Uint8Array(
    BYTES_PER_CHAR_CODE + codeUnits.length * BYTES_PER_CHAR_CODE,
  );
  bytes[0] = BOM_BYTE_0;
  bytes[1] = BOM_BYTE_1;
  for (let i = 0; i < codeUnits.length; i++) {
    bytes[BYTES_PER_CHAR_CODE + i * BYTES_PER_CHAR_CODE] =
      (codeUnits[i] >> HIGH_BYTE_SHIFT) & BYTE_MASK;
    bytes[BYTES_PER_CHAR_CODE + i * BYTES_PER_CHAR_CODE + 1] =
      codeUnits[i] & BYTE_MASK;
  }
  return { type: "string", value: bytes, encoding: "literal" };
};

/**
 * エントリマップから PdfDictionary を作る。
 *
 * @param entries - 辞書エントリ
 * @returns 構築された PdfDictionary
 */
export const okDict = (entries: Map<string, PdfValue>): PdfDictionary => ({
  type: "dictionary",
  entries,
});

/**
 * `[キー, PdfValue]` のリストから `/Info` 辞書を構築する。
 *
 * @param fields - キーと値のペア
 * @returns 構築された PdfDictionary
 */
export const makeInfoDict = (
  fields: ReadonlyArray<readonly [string, PdfValue]>,
): PdfDictionary => okDict(new Map(fields));

/**
 * resolver の挙動を ok 値で固定するスタブ。
 *
 * @param info - 解決時に返す PdfObject
 * @returns ResolveRef 互換の関数
 */
export const makeResolverWithInfo = (
  info: PdfObject,
): ((ref: IndirectRef) => Promise<Result<PdfObject, PdfError>>) => {
  return async () => {
    return { ok: true, value: info };
  };
};
