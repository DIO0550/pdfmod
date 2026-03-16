import { test, expect } from "vitest";
import type {
  PdfErrorCode,
  PdfParseErrorCode,
  PdfParseError,
  PdfCircularReferenceError,
  PdfTypeMismatchError,
  PdfWarningCode,
  PdfWarning,
  ObjectId,
} from "../index.js";

test("PdfParseErrorCodeは6つのコードを持つ", () => {
  const codes: PdfParseErrorCode[] = [
    "INVALID_HEADER",
    "STARTXREF_NOT_FOUND",
    "ROOT_NOT_FOUND",
    "SIZE_NOT_FOUND",
    "MEDIABOX_NOT_FOUND",
    "NESTING_TOO_DEEP",
  ];
  expect(codes).toHaveLength(6);
});

test("型エクスポートが利用可能", () => {
  const errorCode: PdfErrorCode = "INVALID_HEADER";
  const parseErrorCode: PdfParseErrorCode = "STARTXREF_NOT_FOUND";
  const warningCode: PdfWarningCode = "EOF_NOT_FOUND";
  const warning: PdfWarning = { code: "EOF_NOT_FOUND", message: "EOF marker not found" };
  const objectId: ObjectId = { objectNumber: 1, generationNumber: 0 };
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
