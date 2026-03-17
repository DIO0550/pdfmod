import type { ObjectId } from "../types/index.js";

/** Parse error codes */
export type PdfParseErrorCode =
  | "INVALID_HEADER"
  | "STARTXREF_NOT_FOUND"
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP";

/** All fatal PDF error codes */
export type PdfErrorCode =
  | PdfParseErrorCode
  | "CIRCULAR_REFERENCE"
  | "TYPE_MISMATCH";

/** Parse error — unrecoverable structural/syntactic problem */
export interface PdfParseError {
  readonly code: PdfParseErrorCode;
  readonly message: string;
  readonly offset?: number;
}

/** Circular reference detected during object resolution */
export interface PdfCircularReferenceError {
  readonly code: "CIRCULAR_REFERENCE";
  readonly message: string;
  readonly objectId: ObjectId;
}

/** PDF object type does not match expected type */
export interface PdfTypeMismatchError {
  readonly code: "TYPE_MISMATCH";
  readonly message: string;
  readonly expected: string;
  readonly actual: string;
}

/** Discriminated union of all fatal PDF errors */
export type PdfError =
  | PdfParseError
  | PdfCircularReferenceError
  | PdfTypeMismatchError;
