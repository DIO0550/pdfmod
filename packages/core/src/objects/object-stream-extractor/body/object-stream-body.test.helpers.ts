import type { PdfError } from "../../../errors/index";
import type { Result } from "../../../result/index";
import type { PdfDictionary, PdfObject } from "../../../types/pdf-types/index";
import type { StreamResolver } from "../types";

/**
 * 文字列を UTF-8 バイト列にエンコードする。
 *
 * @param s - エンコード対象の文字列
 * @returns UTF-8 エンコードされたバイト列
 */
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * ObjStm 辞書のテスト用ビルダー。
 *
 * @param overrides - デフォルト値を上書きするエントリ
 * @returns ObjStm 辞書
 */
export function makeObjStmDict(
  overrides: Record<string, PdfObject> = {},
): PdfDictionary {
  const defaults: Record<string, PdfObject> = {
    Type: { type: "name", value: "ObjStm" },
    First: { type: "integer", value: 4 },
    N: { type: "integer", value: 1 },
    Filter: { type: "name", value: "FlateDecode" },
  };
  return {
    type: "dictionary",
    entries: new Map(Object.entries({ ...defaults, ...overrides })),
  };
}

/**
 * ストリームオブジェクトのテスト用ビルダー。
 *
 * @param data - ストリームデータ
 * @param dict - ストリーム辞書（省略時はデフォルト ObjStm 辞書）
 * @returns ストリーム PdfObject
 */
export function makeStreamObj(
  data: Uint8Array,
  dict?: PdfDictionary,
): PdfObject {
  return {
    type: "stream",
    dictionary: dict ?? makeObjStmDict(),
    data,
  };
}

/**
 * ObjStm 辞書エントリの Map を生成するテスト用ビルダー。
 *
 * @param overrides - デフォルト値を上書きするエントリ
 * @returns 辞書エントリの Map
 */
export function makeDict(
  overrides: Record<string, PdfObject> = {},
): Map<string, PdfObject> {
  const defaults: Record<string, PdfObject> = {
    Type: { type: "name", value: "ObjStm" },
    First: { type: "integer", value: 24 },
    N: { type: "integer", value: 3 },
    Filter: { type: "name", value: "FlateDecode" },
  };
  return new Map(Object.entries({ ...defaults, ...overrides }));
}

/**
 * StreamResolver のテスト用スタブを生成する。
 *
 * @param result - resolve() が返す固定値
 * @returns StreamResolver スタブ
 */
export function stubResolver(
  result: Result<PdfObject, PdfError>,
): StreamResolver {
  return { resolve: () => Promise.resolve(result) };
}
