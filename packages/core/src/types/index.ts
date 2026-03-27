/**
 * PDFトークンの種別を表す列挙型。
 * PDF字句解析器が生成するトークンの分類に使用する。
 *
 * @example
 * ```ts
 * const token: Token = { type: TokenType.Integer, value: 42, offset: ByteOffset.of(0) };
 * if (token.type === TokenType.Name) {
 *   console.log(token.value); // "Type" など
 * }
 * ```
 */
export enum TokenType {
  Boolean = "Boolean",
  Integer = "Integer",
  Real = "Real",
  LiteralString = "LiteralString",
  HexString = "HexString",
  Name = "Name",
  ArrayBegin = "ArrayBegin",
  ArrayEnd = "ArrayEnd",
  DictBegin = "DictBegin",
  DictEnd = "DictEnd",
  Null = "Null",
  Keyword = "Keyword",
  EOF = "EOF",
}

import type { ByteOffset } from "./byte-offset";
import type { GenerationNumber } from "./generation-number";
import type { ObjectNumber } from "./object-number";

/**
 * 字句解析器が生成する単一のトークン。
 * トークン種別、値、およびバイトストリーム内の出現位置を保持する。
 *
 * @example
 * ```ts
 * const token: Token = { type: TokenType.Name, value: "Type", offset: ByteOffset.of(15) };
 * ```
 */
export interface Token {
  /** トークン種別 */
  type: TokenType;
  /** トークンの値（型はトークン種別に依存する） */
  value: string | number | boolean | null;
  /** バイトストリーム内のオフセット位置 */
  offset: ByteOffset;
}

/**
 * PDF間接オブジェクト参照 (例: "5 0 R")。
 * オブジェクト番号と世代番号の組でオブジェクトを参照する。
 *
 * @example
 * ```ts
 * const ref: IndirectRef = { objectNumber: ObjectNumber.of(5), generationNumber: GenerationNumber.of(0) };
 * ```
 */
export interface IndirectRef {
  /** オブジェクト番号 */
  objectNumber: ObjectNumber;
  /** 世代番号 */
  generationNumber: GenerationNumber;
}

/**
 * フリーオブジェクトの相互参照エントリ (type 0)。
 * 削除済みオブジェクトのリンクリストを構成する。
 */
export interface XRefFreeEntry {
  /** エントリ型: フリーオブジェクト */
  type: 0;
  /** 次のフリーオブジェクトの番号 */
  nextFreeObject: ObjectNumber;
  /** 世代番号 */
  generationNumber: GenerationNumber;
}

/**
 * 通常（使用中）オブジェクトの相互参照エントリ (type 1)。
 * ファイル内のバイトオフセットでオブジェクト位置を示す。
 */
export interface XRefUsedEntry {
  /** エントリ型: 通常オブジェクト */
  type: 1;
  /** ファイル内バイトオフセット */
  offset: ByteOffset;
  /** 世代番号 */
  generationNumber: GenerationNumber;
}

/**
 * オブジェクトストリーム内の圧縮エントリ (type 2)。
 * 親ストリームのオブジェクト番号とストリーム内インデックスで位置を示す。
 */
export interface XRefCompressedEntry {
  /** エントリ型: オブジェクトストリーム内 */
  type: 2;
  /** 親ストリームのオブジェクト番号 */
  streamObject: ObjectNumber;
  /** ストリーム内インデックス */
  indexInStream: number;
}

/**
 * PDF相互参照エントリ (ISO 32000 Table 18)。
 * フリー・使用中・圧縮の3バリアントからなる discriminated union。
 */
export type XRefEntry = XRefFreeEntry | XRefUsedEntry | XRefCompressedEntry;

/**
 * PDF辞書オブジェクト。
 * キーと値のペアを保持するPDFの基本データ構造。
 *
 * @example
 * ```ts
 * const dict: PdfDictionary = {
 *   type: "dictionary",
 *   entries: new Map([["Type", { type: "name", value: "Catalog" }]]),
 * };
 * ```
 */
export interface PdfDictionary {
  /** オブジェクト種別識別子 */
  type: "dictionary";
  /** 辞書エントリのマップ（キー: 名前文字列, 値: PDFオブジェクト） */
  entries: Map<string, PdfObject>;
}

/**
 * PDFオブジェクトの判別共用体型 (ISO 32000 7.3)。
 * PDFファイル内の全オブジェクト型を網羅する。
 *
 * @example
 * ```ts
 * const obj: PdfObject = { type: "integer", value: 42 };
 * if (obj.type === "name") {
 *   console.log(obj.value);
 * }
 * ```
 */
export type PdfObject =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "integer"; value: number }
  | { type: "real"; value: number }
  | { type: "string"; value: Uint8Array; encoding: "literal" | "hex" }
  | { type: "name"; value: string }
  | { type: "array"; elements: PdfObject[] }
  | PdfDictionary
  | { type: "stream"; dictionary: PdfDictionary; data: Uint8Array }
  | { type: "indirect-ref"; objectNumber: number; generationNumber: number };

/**
 * 相互参照テーブル。
 * オブジェクト番号からXRefEntryへのマッピングとテーブルサイズを保持する。
 *
 * @example
 * ```ts
 * const table: XRefTable = {
 *   entries: new Map([[ObjectNumber.of(1), { type: 1, offset: ByteOffset.of(1024), generationNumber: GenerationNumber.of(0) }]]),
 *   size: 2,
 * };
 * ```
 */
export interface XRefTable {
  /** オブジェクト番号 → XRefEntryのマッピング */
  entries: Map<ObjectNumber, XRefEntry>;
  /** 最大オブジェクト番号 + 1 */
  size: number;
}

/**
 * トレーラ辞書。
 * PDFファイルのメタデータと相互参照テーブルへの参照を保持する。
 *
 * @example
 * ```ts
 * const trailer: TrailerDict = {
 *   root: { objectNumber: ObjectNumber.of(1), generationNumber: GenerationNumber.of(0) },
 *   size: 10,
 * };
 * ```
 */
export interface TrailerDict {
  /** /Root - ドキュメントカタログの間接参照（必須） */
  root: IndirectRef;
  /** /Size - 相互参照エントリの総数（必須） */
  size: number;
  /** /Prev - 前の相互参照テーブルのバイトオフセット */
  prev?: ByteOffset;
  /** /Info - ドキュメント情報辞書の間接参照 */
  info?: IndirectRef;
  /** /ID - ファイル識別子 [永続ID, 変更ID] */
  id?: [Uint8Array, Uint8Array];
}

/**
 * PDF間接オブジェクトの識別子（{@link IndirectRef} のエイリアス）。
 *
 * @example
 * ```ts
 * const id: ObjectId = { objectNumber: ObjectNumber.of(3), generationNumber: GenerationNumber.of(0) };
 * ```
 */
export type ObjectId = IndirectRef;

export type { Brand } from "./brand";
export { ByteOffset } from "./byte-offset";
export { GenerationNumber } from "./generation-number";
export { ObjectNumber } from "./object-number";
