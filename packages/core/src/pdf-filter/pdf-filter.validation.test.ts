import { expect, test } from "vitest";
import type { PdfValue } from "../types/pdf-types/index";
import { PdfFilter } from "./index";

test("/Filter がない場合 ok(undefined) を返す", () => {
  const entries = new Map<string, PdfValue>();
  const result = PdfFilter.validate(entries);
  expect(result).toStrictEqual({ ok: true, value: undefined });
});

test("/Filter が FlateDecode の場合 ok('FlateDecode') を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "name", value: "FlateDecode" }],
  ]);
  const result = PdfFilter.validate(entries);
  expect(result).toStrictEqual({ ok: true, value: "FlateDecode" });
});

test("/Filter が name でない場合 err を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "integer", value: 1 }],
  ]);
  const result = PdfFilter.validate(entries);
  expect(result.ok).toBe(false);
});

test("/Filter が配列の場合 err を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "array", elements: [] }],
  ]);
  const result = PdfFilter.validate(entries);
  expect(result.ok).toBe(false);
});

test("/Filter が未サポートの名前の場合 err を返す", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "name", value: "LZWDecode" }],
  ]);
  const result = PdfFilter.validate(entries);
  expect(result.ok).toBe(false);
});

test("errorCode を指定した場合そのコードが使われる", () => {
  const entries = new Map<string, PdfValue>([
    ["Filter", { type: "integer", value: 1 }],
  ]);
  const result = PdfFilter.validate(entries, "XREF_STREAM_INVALID");
  expect(result).toStrictEqual({
    ok: false,
    error: {
      code: "XREF_STREAM_INVALID",
      message: "/Filter must be a name, got integer",
    },
  });
});
