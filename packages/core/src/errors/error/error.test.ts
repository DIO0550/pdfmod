import { expect, test } from "vitest";
import type { ObjectId, PdfError, PdfParseError } from "../../index";
import { ByteOffset } from "../../types/byte-offset/index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";

test("PdfParseErrorはcodeとoffsetを持つ", () => {
  const error: PdfError = {
    code: "INVALID_HEADER",
    message: "bad header",
    offset: ByteOffset.of(0),
  };

  expect(error.code).toBe("INVALID_HEADER");
  expect((error as PdfParseError).offset).toBe(0);
  expect(error.message).toBe("bad header");
});

test("PdfCircularReferenceErrorはobjectIdを持つ", () => {
  const objectId: ObjectId = {
    objectNumber: ObjectNumber.of(5),
    generationNumber: GenerationNumber.of(0),
  };
  const error: PdfError = {
    code: "CIRCULAR_REFERENCE",
    message: "cycle detected",
    objectId,
  };

  expect(error.code).toBe("CIRCULAR_REFERENCE");
  expect(
    (error as Extract<PdfError, { code: "CIRCULAR_REFERENCE" }>).objectId,
  ).toEqual(objectId);
});

test("PdfTypeMismatchErrorはexpectedとactualを持つ", () => {
  const error: PdfError = {
    code: "TYPE_MISMATCH",
    message: "wrong type",
    expected: "Dictionary",
    actual: "Array",
  };

  expect(error.code).toBe("TYPE_MISMATCH");
  expect((error as Extract<PdfError, { code: "TYPE_MISMATCH" }>).expected).toBe(
    "Dictionary",
  );
  expect((error as Extract<PdfError, { code: "TYPE_MISMATCH" }>).actual).toBe(
    "Array",
  );
});

test("PdfParseErrorのoffsetは省略可能", () => {
  const withOffset: PdfParseError = {
    code: "INVALID_HEADER",
    message: "bad header",
    offset: ByteOffset.of(42),
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
    objectId: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
  };
  const json = JSON.parse(JSON.stringify(error));
  expect(json).toEqual({
    code: "CIRCULAR_REFERENCE",
    message: "cycle",
    objectId: { objectNumber: 1, generationNumber: 0 },
  });
});
