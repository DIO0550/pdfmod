import type {
  PdfDictionary,
  PdfStream,
  PdfValue,
} from "../../../../pdf/types/pdf-types/index";

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
  overrides: Record<string, PdfValue> = {},
): PdfDictionary {
  const defaults: Record<string, PdfValue> = {
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
 * @returns ストリーム PdfStream
 */
export function makeStreamObj(
  data: Uint8Array,
  dict?: PdfDictionary,
): PdfStream {
  return {
    type: "stream",
    dictionary: dict ?? makeObjStmDict(),
    data,
  };
}

/**
 * ヘッダと本文から未圧縮 ObjStm を組み立てる。
 *
 * @param options - ヘッダ文字列、本文文字列、ヘッダのペア数
 * @returns 実バイトの本文を持つ ObjStm
 */
export function makeRawObjStm(options: {
  readonly header: string;
  readonly body: string;
  readonly n: number;
}): PdfStream {
  const dict = makeObjStmDict({
    First: { type: "integer", value: enc(options.header).length },
    N: { type: "integer", value: options.n },
  });
  dict.entries.delete("Filter");
  return makeStreamObj(enc(`${options.header}${options.body}`), dict);
}

/**
 * ObjStm 辞書エントリの Map を生成するテスト用ビルダー。
 *
 * @param overrides - デフォルト値を上書きするエントリ
 * @returns 辞書エントリの Map
 */
export function makeDict(
  overrides: Record<string, PdfValue> = {},
): Map<string, PdfValue> {
  const defaults: Record<string, PdfValue> = {
    Type: { type: "name", value: "ObjStm" },
    First: { type: "integer", value: 24 },
    N: { type: "integer", value: 3 },
    Filter: { type: "name", value: "FlateDecode" },
  };
  return new Map(Object.entries({ ...defaults, ...overrides }));
}
