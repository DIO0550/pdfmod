import { expect, test } from "vitest";
import type {
  ObjectId,
  PdfCircularReferenceError,
  PdfError,
  PdfErrorCode,
  PdfOperatorOperandMissingError,
  PdfOperatorOperandTypeMismatchError,
  PdfOperatorOperandValueOutOfRangeError,
  PdfOperatorPathNoCurrentPointError,
  PdfOperatorRegistryError,
  PdfParseError,
  PdfParseErrorCode,
  PdfTypeMismatchError,
  PdfWarning,
  PdfWarningCode,
} from "../../../../index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { ObjectNumber } from "../../../types/object-number/index";

type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

const allPdfParseErrorCodes = [
  "INVALID_HEADER",
  "STARTXREF_NOT_FOUND",
  "XREF_TABLE_INVALID",
  "XREF_STREAM_INVALID",
  "XREF_PREV_CHAIN_CYCLE",
  "XREF_PREV_CHAIN_TOO_DEEP",
  "TRAILER_DICT_INVALID",
  "ROOT_NOT_FOUND",
  "SIZE_NOT_FOUND",
  "MEDIABOX_NOT_FOUND",
  "NESTING_TOO_DEEP",
  "FLATEDECODE_FAILED",
  "PDF_TYPE_INVALID",
  "PDF_FILTER_UNSUPPORTED",
  "OBJECT_STREAM_INVALID",
  "OBJECT_STREAM_INDEX_OUT_OF_RANGE",
  "OBJECT_STREAM_HEADER_INVALID",
  "OBJECT_PARSE_UNEXPECTED_TOKEN",
  "OBJECT_PARSE_UNTERMINATED",
  "OBJECT_PARSE_STREAM_LENGTH",
  "CONTENT_STREAM_INLINE_IMAGE_INVALID",
  "TOKENIZER_POSITION_OUT_OF_RANGE",
  "CATALOG_TYPE_INVALID",
  "PAGES_NOT_FOUND",
  "CATALOG_ROOT_NOT_DICTIONARY",
  "NOT_IMPLEMENTED",
] as const satisfies readonly PdfParseErrorCode[];

// 配列の要素型がPdfParseErrorCodeと完全一致することを型レベルで保証
// PdfParseErrorCodeに新しいコードが追加された場合、ここでコンパイルエラーになる
const _exhaustive: Exact<
  (typeof allPdfParseErrorCodes)[number],
  PdfParseErrorCode
> = true;

test("PdfParseErrorCodeは網羅的に列挙されている", () => {
  expect(_exhaustive).toBe(true);
  expect(allPdfParseErrorCodes).toHaveLength(26);
});

test("型エクスポートが利用可能", () => {
  const errorCode: PdfErrorCode = "INVALID_HEADER";
  const parseErrorCode: PdfParseErrorCode = "STARTXREF_NOT_FOUND";
  const warningCode: PdfWarningCode = "EOF_NOT_FOUND";
  const warning: PdfWarning = {
    code: "EOF_NOT_FOUND",
    message: "EOF marker not found",
  };
  const objectId: ObjectId = {
    objectNumber: ObjectNumber.of(1),
    generationNumber: GenerationNumber.of(0),
  };
  const parseError: PdfParseError = { code: "INVALID_HEADER", message: "test" };
  const circularError: PdfCircularReferenceError = {
    code: "CIRCULAR_REFERENCE",
    message: "test",
    objectId,
  };
  const typeError: PdfTypeMismatchError = {
    code: "TYPE_MISMATCH",
    message: "test",
    expected: "A",
    actual: "B",
  };
  const operatorRegistryError: PdfOperatorRegistryError = {
    code: "OPERATOR_ALREADY_REGISTERED",
    message: "test",
    operatorName: "rg",
  };
  const operatorRegistryErrorCode: PdfErrorCode = "OPERATOR_ALREADY_REGISTERED";

  expect(errorCode).toBe("INVALID_HEADER");
  expect(parseErrorCode).toBe("STARTXREF_NOT_FOUND");
  expect(warningCode).toBe("EOF_NOT_FOUND");
  expect(warning.code).toBe("EOF_NOT_FOUND");
  expect(objectId.objectNumber).toBe(1);
  expect(parseError.code).toBe("INVALID_HEADER");
  expect(circularError.code).toBe("CIRCULAR_REFERENCE");
  expect(typeError.code).toBe("TYPE_MISMATCH");
  expect(operatorRegistryError.operatorName).toBe("rg");
  expect(operatorRegistryErrorCode).toBe("OPERATOR_ALREADY_REGISTERED");
});

test("PdfOperatorOperandMissingError は PdfError union から narrow できる", () => {
  const operandMissingError: PdfOperatorOperandMissingError = {
    code: "OPERATOR_OPERAND_MISSING",
    message: "Operator 'w' requires 1 operand(s), got 0",
    operatorName: "w",
    required: 1,
    actual: 0,
  };
  const error: PdfError = operandMissingError;

  const narrowed: Exact<
    Extract<PdfError, { code: "OPERATOR_OPERAND_MISSING" }>,
    PdfOperatorOperandMissingError
  > = true;

  expect(narrowed).toBe(true);
  expect(error.code).toBe("OPERATOR_OPERAND_MISSING");
  expect(operandMissingError.required).toBe(1);
  expect(operandMissingError.actual).toBe(0);
});

test("PdfOperatorOperandTypeMismatchError は PdfError union から narrow できる", () => {
  const typeMismatchError: PdfOperatorOperandTypeMismatchError = {
    code: "OPERATOR_OPERAND_TYPE_MISMATCH",
    message: "Operator 'w' expected number operand, got name",
    operatorName: "w",
    expected: "number",
    actual: "name",
  };
  const error: PdfError = typeMismatchError;

  const narrowed: Exact<
    Extract<PdfError, { code: "OPERATOR_OPERAND_TYPE_MISMATCH" }>,
    PdfOperatorOperandTypeMismatchError
  > = true;

  expect(narrowed).toBe(true);
  expect(error.code).toBe("OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(typeMismatchError.expected).toBe("number");
  expect(typeMismatchError.actual).toBe("name");
});

test("PdfOperatorOperandValueOutOfRangeError は PdfError union から narrow できる", () => {
  const valueOutOfRangeError: PdfOperatorOperandValueOutOfRangeError = {
    code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE",
    message:
      "Operator 'J' operand value 3 is out of range, expected one of [0, 1, 2]",
    operatorName: "J",
    allowed: [0, 1, 2],
    actual: 3,
  };
  const error: PdfError = valueOutOfRangeError;

  const narrowed: Exact<
    Extract<PdfError, { code: "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE" }>,
    PdfOperatorOperandValueOutOfRangeError
  > = true;

  expect(narrowed).toBe(true);
  expect(error.code).toBe("OPERATOR_OPERAND_VALUE_OUT_OF_RANGE");
  expect(valueOutOfRangeError.allowed).toEqual([0, 1, 2]);
  expect(valueOutOfRangeError.actual).toBe(3);
});

test("PdfOperatorPathNoCurrentPointError は PdfError union から narrow できる", () => {
  const noCurrentPointError: PdfOperatorPathNoCurrentPointError = {
    code: "OPERATOR_PATH_NO_CURRENT_POINT",
    message:
      "Operator 'l' requires a current point established by a prior 'm' or 're'",
    operatorName: "l",
  };
  const error: PdfError = noCurrentPointError;

  const narrowed: Exact<
    Extract<PdfError, { code: "OPERATOR_PATH_NO_CURRENT_POINT" }>,
    PdfOperatorPathNoCurrentPointError
  > = true;

  expect(narrowed).toBe(true);
  expect(error.code).toBe("OPERATOR_PATH_NO_CURRENT_POINT");
  expect(noCurrentPointError.operatorName).toBe("l");
});
