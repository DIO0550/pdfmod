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
} from "../index";
import { GenerationNumber } from "../types/generation-number";
import { ObjectNumber } from "../types/object-number";

test("PdfParseErrorCodeは9つのコードを持つ", () => {
  const codes: PdfParseErrorCode[] = [
    "INVALID_HEADER",
    "STARTXREF_NOT_FOUND",
    "XREF_TABLE_INVALID",
    "XREF_STREAM_INVALID",
    "ROOT_NOT_FOUND",
    "SIZE_NOT_FOUND",
    "MEDIABOX_NOT_FOUND",
    "NESTING_TOO_DEEP",
    "FLATEDECODE_FAILED",
  ];
  expect(codes).toHaveLength(9);
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
