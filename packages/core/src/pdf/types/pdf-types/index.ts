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

import type { ByteOffset } from "../byte-offset/index";
import type { GenerationNumber } from "../generation-number/index";
import type { IndirectRef } from "../indirect-ref/index";
import type { ObjectNumber } from "../object-number/index";

export type { IndirectRef } from "../indirect-ref/index";

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
 * null オブジェクト (ISO 32000 7.3.9)。
 */
export interface PdfNull {
  type: "null";
}

/**
 * 真偽値オブジェクト (ISO 32000 7.3.2)。
 */
export interface PdfBoolean {
  type: "boolean";
  value: boolean;
}

/**
 * 整数オブジェクト (ISO 32000 7.3.3)。
 */
export interface PdfInteger {
  type: "integer";
  value: number;
}

/**
 * 実数オブジェクト (ISO 32000 7.3.3)。
 */
export interface PdfReal {
  type: "real";
  value: number;
}

/**
 * 文字列オブジェクト (ISO 32000 7.3.4)。
 * リテラル形式・16進形式の両方を扱う。
 */
export interface PdfString {
  type: "string";
  value: Uint8Array;
  encoding: "literal" | "hex";
}

/**
 * 名前オブジェクト (ISO 32000 7.3.5)。
 */
export interface PdfName {
  type: "name";
  value: string;
}

/**
 * 配列オブジェクト (ISO 32000 7.3.6)。
 * 要素は PdfValue に限定され、stream を含むことはできない。
 */
export interface PdfArray {
  type: "array";
  elements: PdfValue[];
}

/**
 * PDF辞書オブジェクト (ISO 32000 7.3.7)。
 * entries の値は PdfValue に限定され、stream を含むことはできない。
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
  /** 辞書エントリのマップ（キー: 名前文字列, 値: PDF値） */
  entries: Map<string, PdfValue>;
}

/**
 * 間接参照 (ISO 32000 7.3.10)。
 * 値として配列・辞書・トップレベルに現れる。
 */
export interface PdfIndirectRef {
  type: "indirect-ref";
  objectNumber: number;
  generationNumber: number;
}

/**
 * ストリームオブジェクト (ISO 32000 7.3.8)。
 * 間接オブジェクトの本体にのみ現れる。
 */
export interface PdfStream {
  type: "stream";
  dictionary: PdfDictionary;
  data: Uint8Array;
}

/**
 * PDF 値型 (ISO 32000 7.3)。
 * 配列・辞書の中や、トップレベルの値として現れる型。
 * stream は含まない（stream は間接オブジェクト本体のみに現れる）。
 */
export type PdfValue =
  | PdfNull
  | PdfBoolean
  | PdfInteger
  | PdfReal
  | PdfString
  | PdfName
  | PdfArray
  | PdfDictionary
  | PdfIndirectRef;

/**
 * PDF object 全体型 (ISO 32000 7.3)。
 * PDF 仕様の "PDF object" 概念に対応。9つの基本型 + 間接参照 + stream をすべて含む。
 * `parseIndirectObject` の body（間接オブジェクトの中身）として使われる。
 */
export type PdfObject = PdfValue | PdfStream;

/**
 * 間接オブジェクト (ISO 32000 7.3.10)。
 * `N G obj ... endobj` の定義全体を表す。
 */
export interface PdfIndirectObject {
  /** N: オブジェクト番号 */
  objectNumber: ObjectNumber;
  /** G: 世代番号 */
  generationNumber: GenerationNumber;
  /** 中身（値または stream） */
  body: PdfObject;
}

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
