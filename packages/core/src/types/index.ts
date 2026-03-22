/** PDF token types produced by the lexer */
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

/** A single token produced by the lexer */
export interface Token {
  type: TokenType;
  value: string | number | boolean | null;
  offset: number;
}

/** Represents a PDF indirect object reference (e.g. "5 0 R") */
export interface IndirectRef {
  objectNumber: number;
  generationNumber: number;
}

/** PDF cross-reference entry (ISO 32000 Table 18) */
export interface XRefEntry {
  /** Entry type: 0=free, 1=normal object, 2=in object stream */
  type: 0 | 1 | 2;
  /** type=0: next free object number, type=1: byte offset in file, type=2: object number of parent stream */
  field2: number;
  /** type=0,1: generation number, type=2: index within stream */
  field3: number;
}

/** PDF dictionary object */
export interface PdfDictionary {
  type: "dictionary";
  entries: Map<string, PdfObject>;
}

/** PDF object union type (ISO 32000 7.3) */
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

/** Cross-reference table */
export interface XRefTable {
  /** Object number -> XRefEntry mapping */
  entries: Map<number, XRefEntry>;
  /** Maximum object number + 1 */
  size: number;
}

/** Trailer dictionary */
export interface TrailerDict {
  /** /Root - document catalog indirect reference (required) */
  root: IndirectRef;
  /** /Size - total number of xref entries (required) */
  size: number;
  /** /Prev - byte offset of previous xref table */
  prev?: number;
  /** /Info - document info dictionary indirect reference */
  info?: IndirectRef;
  /** /ID - file identifiers [permanent-id, change-id] */
  id?: [Uint8Array, Uint8Array];
}

/** Object identifier for PDF indirect objects (alias for IndirectRef) */
export type ObjectId = IndirectRef;

export type { Brand, ObjectNumber, GenerationNumber, ByteOffset } from "./brand.js";
