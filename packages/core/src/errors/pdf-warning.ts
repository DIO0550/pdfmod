/** Warning codes for recoverable PDF issues */
export type PdfWarningCode =
  | "EOF_NOT_FOUND"
  | "XREF_OFFSET_MISMATCH"
  | "XREF_REBUILD"
  | "XREF_ENTRY_FORMAT"
  | "PAGE_TREE_CYCLE"
  | "COUNT_MISMATCH"
  | "INVALID_ROTATE"
  | "STREAM_LENGTH_MISMATCH"
  | "DUPLICATE_OBJECT"
  | "UNKNOWN_PAGE_TYPE"
  | "DATE_PARSE_FAILED";

/** Warning for recoverable PDF issues (not thrown, passed to onWarning callback) */
export interface PdfWarning {
  /** Warning code */
  readonly code: PdfWarningCode;
  /** Human-readable message */
  readonly message: string;
  /** Byte offset where the issue was detected */
  readonly offset?: number;
  /** Description of the recovery/fallback applied */
  readonly recovery?: string;
}
