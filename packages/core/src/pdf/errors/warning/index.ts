/**
 * 回復可能なPDF問題の警告コード。
 * 致命的ではないが注意が必要な問題を分類する。
 *
 * @example
 * ```ts
 * const code: PdfWarningCode = "EOF_NOT_FOUND";
 * ```
 */
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
  | "DATE_PARSE_FAILED"
  | "MISSING_KIDS"
  | "PAGE_TREE_TOO_DEEP"
  | "RESOURCES_RESOLVE_FAILED"
  | "INFO_RESOLVE_FAILED"
  | "INFO_NOT_DICTIONARY"
  | "STRING_DECODE_FAILED"
  | "TRAPPED_INVALID";

/**
 * 回復可能なPDF問題の警告。
 * throwされず、onWarningコールバックに渡される。
 *
 * @example
 * ```ts
 * const warning: PdfWarning = {
 *   code: "EOF_NOT_FOUND",
 *   message: "%%EOFマーカーが見つかりません",
 *   offset: 2048,
 *   recovery: "ファイル末尾をEOFとして扱います",
 * };
 * ```
 */
export interface PdfWarning {
  /** 警告コード */
  readonly code: PdfWarningCode;
  /** 人間可読な警告メッセージ */
  readonly message: string;
  /** 問題が検出されたバイトオフセット */
  readonly offset?: number;
  /** 適用されたリカバリ・フォールバックの説明 */
  readonly recovery?: string;
}
