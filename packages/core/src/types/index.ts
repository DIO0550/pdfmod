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

/** PDF cross-reference entry */
export interface XRefEntry {
  offset: number;
  generationNumber: number;
  inUse: boolean;
}

/** Object identifier for PDF indirect objects (alias for IndirectRef) */
export type ObjectId = IndirectRef;
