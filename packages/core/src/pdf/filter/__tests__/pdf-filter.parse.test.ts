import { assert, expect, test } from "vitest";
import type { PdfValue } from "../../types/pdf-types/index";
import { PdfFilter } from "../index";

test("/Filter がない場合 ok(undefined) を返す", () => {
  const entries = new Map<string, PdfValue>();
  const result = PdfFilter.parse(entries);
  expect(result).toStrictEqual({ ok: true, value: undefined });
});

test("/Filter が FlateDecode の場合 ok('FlateDecode') を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "name", value: "FlateDecode" }],
  ]);
  const result = PdfFilter.parse(entries);
  expect(result).toStrictEqual({ ok: true, value: "FlateDecode" });
});

test("/Filter が単一要素配列[/FlateDecode]の場合 ok('FlateDecode') を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Filter",
      {
        type: "array",
        elements: [{ type: "name", value: "FlateDecode" }],
      },
    ],
  ]);
  const result = PdfFilter.parse(entries);
  expect(result).toStrictEqual({ ok: true, value: "FlateDecode" });
});

test("/Filter が空配列の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "array", elements: [] }],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("0 filters");
});

test("/Filter が複数要素配列の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Filter",
      {
        type: "array",
        elements: [
          { type: "name", value: "ASCII85Decode" },
          { type: "name", value: "FlateDecode" },
        ],
      },
    ],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("2 filters");
});

test("/Filter が name/array 以外の不正型の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "integer", value: 1 }],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("must be a name, got integer");
});

test("/Filter 配列の要素が name 以外の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Filter",
      {
        type: "array",
        elements: [{ type: "integer", value: 10 }],
      },
    ],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("must be a name, got integer");
});

test("/Filter が未サポートの名前の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "name", value: "LZWDecode" }],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("LZWDecode");
});

test("/Filter が単一要素配列で未サポートの名前([/LZWDecode])の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    [
      "Filter",
      {
        type: "array",
        elements: [{ type: "name", value: "LZWDecode" }],
      },
    ],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("LZWDecode");
});
