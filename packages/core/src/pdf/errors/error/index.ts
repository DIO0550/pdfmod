import type { ByteOffset } from "../../types/byte-offset/index";
import type { ObjectId } from "../../types/index";

/**
 * PDFパースエラーのエラーコード。
 * 構造的・構文的な問題、および未実装機能など実装側都合の致命的エラーを分類する。
 *
 * @example
 * ```ts
 * const code: PdfParseErrorCode = "STARTXREF_NOT_FOUND";
 * ```
 */
export type PdfParseErrorCode =
  | "INVALID_HEADER"
  | "STARTXREF_NOT_FOUND"
  | "XREF_TABLE_INVALID"
  | "XREF_STREAM_INVALID"
  | "XREF_PREV_CHAIN_CYCLE"
  | "XREF_PREV_CHAIN_TOO_DEEP"
  | "TRAILER_DICT_INVALID"
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP"
  | "FLATEDECODE_FAILED"
  | "PDF_TYPE_INVALID"
  | "PDF_FILTER_UNSUPPORTED"
  | "OBJECT_STREAM_INVALID"
  | "OBJECT_STREAM_INDEX_OUT_OF_RANGE"
  | "OBJECT_STREAM_HEADER_INVALID"
  | "OBJECT_PARSE_UNEXPECTED_TOKEN"
  | "OBJECT_PARSE_UNTERMINATED"
  | "OBJECT_PARSE_STREAM_LENGTH"
  | "CONTENT_STREAM_INLINE_IMAGE_INVALID"
  | "TOKENIZER_POSITION_OUT_OF_RANGE"
  | "CATALOG_TYPE_INVALID"
  | "PAGES_NOT_FOUND"
  | "CATALOG_ROOT_NOT_DICTIONARY"
  | "NOT_IMPLEMENTED";

/**
 * 全致命的PDFエラーコードの共用体型。
 * パースエラーコードに加え、循環参照・型不一致・operator registry エラー、
 * operator オペランド不足／型不一致／値域外エラー、
 * path operator の current point 未確立エラー、
 * operator の不正なステート遷移エラー（OPERATOR_ILLEGAL_STATE）のコードを含む。
 *
 * @example
 * ```ts
 * const code: PdfErrorCode = "CIRCULAR_REFERENCE";
 * ```
 */
export type PdfErrorCode =
  | PdfParseErrorCode
  | "CIRCULAR_REFERENCE"
  | "TYPE_MISMATCH"
  | "OPERATOR_ALREADY_REGISTERED"
  | "OPERATOR_OPERAND_MISSING"
  | "OPERATOR_OPERAND_TYPE_MISMATCH"
  | "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE"
  | "OPERATOR_PATH_NO_CURRENT_POINT"
  | "OPERATOR_ILLEGAL_STATE"
  | "INLINE_IMAGE_REQUIRED_KEY_MISSING";

/**
 * PDFパースエラーを表すインターフェース。
 * パース処理で発生した回復不能な構造的・構文的問題の種別とメッセージを保持する。
 *
 * @example
 * ```ts
 * const error: PdfParseError = {
 *   code: "STARTXREF_NOT_FOUND",
 *   message: "startxrefキーワードが見つかりません",
 *   offset: ByteOffset.of(1024),
 * };
 * ```
 */
export interface PdfParseError {
  /** エラーコード */
  readonly code: PdfParseErrorCode;
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 問題が検出されたバイトオフセット */
  readonly offset?: ByteOffset;
}

/**
 * オブジェクト解決時の循環参照エラー。
 * 間接オブジェクトの参照が循環している場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfCircularReferenceError = {
 *   code: "CIRCULAR_REFERENCE",
 *   message: "循環参照を検出しました",
 *   objectId: { objectNumber: 5, generationNumber: 0 },
 * };
 * ```
 */
export interface PdfCircularReferenceError {
  /** エラーコード（常に "CIRCULAR_REFERENCE"） */
  readonly code: "CIRCULAR_REFERENCE";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 循環参照が検出されたオブジェクトの識別子 */
  readonly objectId: ObjectId;
}

/**
 * PDFオブジェクトの型不一致エラー。
 * 期待される型と実際の型が一致しない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfTypeMismatchError = {
 *   code: "TYPE_MISMATCH",
 *   message: "期待: dictionary, 実際: array",
 *   expected: "dictionary",
 *   actual: "array",
 * };
 * ```
 */
export interface PdfTypeMismatchError {
  /** エラーコード（常に "TYPE_MISMATCH"） */
  readonly code: "TYPE_MISMATCH";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 期待されるオブジェクト型 */
  readonly expected: string;
  /** 実際のオブジェクト型 */
  readonly actual: string;
}

/**
 * Content stream operator registry の登録エラー。
 * 同じ operator 名に複数 handler を登録しようとした場合に発生する。
 */
export interface PdfOperatorRegistryError {
  /** エラーコード（常に "OPERATOR_ALREADY_REGISTERED"） */
  readonly code: "OPERATOR_ALREADY_REGISTERED";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 重複登録された operator 名 */
  readonly operatorName: string;
}

/**
 * Content stream operator のオペランド不足エラー。
 * handler が必要とする数のオペランドが operand stack に積まれていない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfOperatorOperandMissingError = {
 *   code: "OPERATOR_OPERAND_MISSING",
 *   message: "Operator 'w' requires 1 operand(s), got 0",
 *   operatorName: "w",
 *   required: 1,
 *   actual: 0,
 * };
 * ```
 */
export interface PdfOperatorOperandMissingError {
  /** エラーコード（常に "OPERATOR_OPERAND_MISSING"） */
  readonly code: "OPERATOR_OPERAND_MISSING";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 不足を検出した operator 名 */
  readonly operatorName: string;
  /** handler が必要とするオペランド数 */
  readonly required: number;
  /** 実際に存在したオペランド数 */
  readonly actual: number;
}

/**
 * Content stream operator のオペランド型不一致エラー。
 * pop した PdfObject の `type` が handler の期待する型と一致しない場合に発生する。
 *
 * @example
 * ```ts
 * const error: PdfOperatorOperandTypeMismatchError = {
 *   code: "OPERATOR_OPERAND_TYPE_MISMATCH",
 *   message: "Operator 'w' expected number operand, got name",
 *   operatorName: "w",
 *   expected: "number",
 *   actual: "name",
 * };
 * ```
 */
export interface PdfOperatorOperandTypeMismatchError {
  /** エラーコード（常に "OPERATOR_OPERAND_TYPE_MISMATCH"） */
  readonly code: "OPERATOR_OPERAND_TYPE_MISMATCH";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 不一致を検出した operator 名 */
  readonly operatorName: string;
  /** 期待されるオペランド型を表す文字列（例: "number"） */
  readonly expected: string;
  /**
   * 実際に pop された PdfObject の `type` を表す文字列（例: "name" / "boolean"）。
   * 型レベルでは `PdfObject['type']` 制約は持たず、後続 operator が独自型名を渡せる汎用 string とする。
   */
  readonly actual: string;
}

/**
 * Content stream operator のオペランド値域外エラー。
 * categorical operand (line cap 0|1|2 / line join 0|1|2 / text rendering mode 0..7 等) の
 * 値が許容集合に含まれない場合に発生する。
 *
 * - `allowed` は汎用 number 配列 (operator 側で `[0, 1, 2]` 等を渡す)。
 * - `actual` は pop された生の数値 (例: 3, -1, MAX_SAFE_INTEGER)。
 *
 * @example
 * ```ts
 * const error: PdfOperatorOperandValueOutOfRangeError = {
 *   code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE",
 *   message: "Operator 'J' operand value 3 is out of range, expected one of [0, 1, 2]",
 *   operatorName: "J",
 *   allowed: [0, 1, 2],
 *   actual: 3,
 * };
 * ```
 */
export interface PdfOperatorOperandValueOutOfRangeError {
  /** エラーコード（常に "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE"） */
  readonly code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 値域外を検出した operator 名 */
  readonly operatorName: string;
  /** operator が許容する categorical 値の集合 */
  readonly allowed: readonly number[];
  /** 実際に pop された数値 */
  readonly actual: number;
}

/**
 * Content stream path operator の current point 未定義エラー。
 * `l` / `c` / `v` / `y` / `h` のように current point から segment を構築する
 * operator が呼び出された時点で current point が確立されていない (`m` / `re`
 * が先行していない) 場合に発生する (ISO 32000-1:2008 §8.5.2)。
 *
 * @example
 * ```ts
 * const error: PdfOperatorPathNoCurrentPointError = {
 *   code: "OPERATOR_PATH_NO_CURRENT_POINT",
 *   message: "Operator 'l' requires a current point established by a prior 'm' or 're'",
 *   operatorName: "l",
 * };
 * ```
 */
export interface PdfOperatorPathNoCurrentPointError {
  /** エラーコード（常に "OPERATOR_PATH_NO_CURRENT_POINT"） */
  readonly code: "OPERATOR_PATH_NO_CURRENT_POINT";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** current point 未定義を検出した operator 名 */
  readonly operatorName: string;
}

/**
 * Content stream operator の不正なステート遷移エラー。
 * operator がその時点のグラフィックスステートでは実行できない場合に発生する。
 * 例: text object が既に active な状態での `BT`（nested BT/ET。ISO 32000-1:2008 §9.4.1）。
 *
 * @example
 * ```ts
 * const error: PdfOperatorIllegalStateError = {
 *   code: "OPERATOR_ILLEGAL_STATE",
 *   message: "BT: text object already active (nested BT/ET is not allowed)",
 *   operatorName: "BT",
 * };
 * ```
 */
export interface PdfOperatorIllegalStateError {
  /** エラーコード（常に "OPERATOR_ILLEGAL_STATE"） */
  readonly code: "OPERATOR_ILLEGAL_STATE";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 不正なステート遷移を検出した operator 名 */
  readonly operatorName: string;
}

/**
 * Inline image (`BI ... ID ... EI`) dict の必須キー欠落エラー。
 * ISO 32000-1:2008 §8.9.5 Table 89 で必須とされる Width / Height /
 * BitsPerComponent / ColorSpace のいずれかが dict 内に存在しない場合に発生する。
 * ImageMask=true（stencil mask）の場合、Table 89 に従い:
 *   - BitsPerComponent は optional（不在時の default 値は 1）
 *   - ColorSpace は仕様上禁止（指定してはならない）
 * このため stencil mask 時は Width / Height のみが必須となる。
 *
 * @example
 * ```ts
 * const error: PdfInlineImageRequiredKeyMissingError = {
 *   code: "INLINE_IMAGE_REQUIRED_KEY_MISSING",
 *   message: "Inline image is missing required key 'Width'",
 *   missingKey: "Width",
 *   offset: ByteOffset.of(42),
 * };
 * ```
 */
export interface PdfInlineImageRequiredKeyMissingError {
  /** エラーコード（常に "INLINE_IMAGE_REQUIRED_KEY_MISSING"） */
  readonly code: "INLINE_IMAGE_REQUIRED_KEY_MISSING";
  /** 人間可読なエラーメッセージ */
  readonly message: string;
  /** 欠落していた必須キー名 */
  readonly missingKey: "Width" | "Height" | "BitsPerComponent" | "ColorSpace";
  /** 該当 inline image token の開始バイト位置 */
  readonly offset: ByteOffset;
}

/**
 * 全致命的PDFエラーの判別共用体型。
 * パースエラー、循環参照エラー、型不一致エラー、operator registry エラー、
 * operator オペランド不足／型不一致／値域外エラー、
 * path operator の current point 未確立エラー、
 * operator の不正なステート遷移エラー（PdfOperatorIllegalStateError）を包含する。
 *
 * @example
 * ```ts
 * function handleError(error: PdfError): string {
 *   switch (error.code) {
 *     case "CIRCULAR_REFERENCE":
 *       return `循環参照: ${error.objectId.objectNumber}`;
 *     default:
 *       return error.message;
 *   }
 * }
 * ```
 */
export type PdfError =
  | PdfParseError
  | PdfCircularReferenceError
  | PdfTypeMismatchError
  | PdfOperatorRegistryError
  | PdfOperatorOperandMissingError
  | PdfOperatorOperandTypeMismatchError
  | PdfOperatorOperandValueOutOfRangeError
  | PdfOperatorPathNoCurrentPointError
  | PdfOperatorIllegalStateError
  | PdfInlineImageRequiredKeyMissingError;
