import { assert, expect, test } from "vitest";
import type { PdfValue } from "../types/pdf-types/index";
import { PdfFilter } from "./index";

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

test("/Filter が name でない場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "integer", value: 1 }],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
  expect(result.error.message).toContain("must be a name");
});

test("/Filter が配列の場合 err(PDF_FILTER_UNSUPPORTED) を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "array", elements: [] }],
  ]);
  const result = PdfFilter.parse(entries);
  assert(!result.ok);
  expect(result.error.code).toBe("PDF_FILTER_UNSUPPORTED");
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
