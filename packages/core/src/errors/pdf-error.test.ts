import { test, expect } from "vitest";
import type {
  PdfParseError,
  PdfError,
  ObjectId,
} from "../index.js";

test("PdfParseErrorはcodeでナローイングできる", () => {
  const error: PdfError = {
    code: "INVALID_HEADER",
    message: "bad header",
    offset: 0,
  };

  if (error.code === "INVALID_HEADER") {
    expect(error.offset).toBe(0);
    expect(error.message).toBe("bad header");
  }
});

test("PdfCircularReferenceErrorはcodeでナローイングできる", () => {
  const objectId: ObjectId = { objectNumber: 5, generationNumber: 0 };
  const error: PdfError = {
    code: "CIRCULAR_REFERENCE",
    message: "cycle detected",
    objectId,
  };

  if (error.code === "CIRCULAR_REFERENCE") {
    expect(error.objectId).toEqual(objectId);
  }
});

test("PdfTypeMismatchErrorはcodeでナローイングできる", () => {
  const error: PdfError = {
    code: "TYPE_MISMATCH",
    message: "wrong type",
    expected: "Dictionary",
    actual: "Array",
  };

  if (error.code === "TYPE_MISMATCH") {
    expect(error.expected).toBe("Dictionary");
    expect(error.actual).toBe("Array");
  }
});

test("PdfParseErrorのoffsetは省略可能", () => {
  const withOffset: PdfParseError = {
    code: "INVALID_HEADER",
    message: "bad header",
    offset: 42,
  };
  const withoutOffset: PdfParseError = {
    code: "INVALID_HEADER",
    message: "bad header",
  };

  expect(withOffset.offset).toBe(42);
  expect(withoutOffset.offset).toBeUndefined();
});

test("PdfErrorはJSONにシリアライズできる", () => {
  const error: PdfError = {
    code: "CIRCULAR_REFERENCE",
    message: "cycle",
    objectId: { objectNumber: 1, generationNumber: 0 },
  };
  const json = JSON.parse(JSON.stringify(error));
  expect(json).toEqual({
    code: "CIRCULAR_REFERENCE",
    message: "cycle",
    objectId: { objectNumber: 1, generationNumber: 0 },
  });
});
