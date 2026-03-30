import { expect, test } from "vitest";
import type {
  ObjectId,
  PdfCircularReferenceError,
  PdfErrorCode,
  PdfParseError,
  PdfParseErrorCode,
  PdfTypeMismatchError,
  PdfWarning,
  PdfWarningCode,
} from "../../index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";

type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

const allPdfParseErrorCodes = [
  "INVALID_HEADER",
  "STARTXREF_NOT_FOUND",
  "XREF_TABLE_INVALID",
  "XREF_STREAM_INVALID",
  "XREF_PREV_CHAIN_CYCLE",
  "XREF_PREV_CHAIN_TOO_DEEP",
  "ROOT_NOT_FOUND",
  "SIZE_NOT_FOUND",
  "MEDIABOX_NOT_FOUND",
  "NESTING_TOO_DEEP",
  "FLATEDECODE_FAILED",
] as const satisfies readonly PdfParseErrorCode[];

// 配列の要素型がPdfParseErrorCodeと完全一致することを型レベルで保証
// PdfParseErrorCodeに新しいコードが追加された場合、ここでコンパイルエラーになる
const _exhaustive: Exact<
  (typeof allPdfParseErrorCodes)[number],
  PdfParseErrorCode
> = true;

test("PdfParseErrorCodeは網羅的に列挙されている", () => {
  expect(_exhaustive).toBe(true);
  expect(allPdfParseErrorCodes).toHaveLength(11);
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

  expect(errorCode).toBe("INVALID_HEADER");
  expect(parseErrorCode).toBe("STARTXREF_NOT_FOUND");
  expect(warningCode).toBe("EOF_NOT_FOUND");
  expect(warning.code).toBe("EOF_NOT_FOUND");
  expect(objectId.objectNumber).toBe(1);
  expect(parseError.code).toBe("INVALID_HEADER");
  expect(circularError.code).toBe("CIRCULAR_REFERENCE");
  expect(typeError.code).toBe("TYPE_MISMATCH");
});
