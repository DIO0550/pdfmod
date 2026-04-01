import { expect, test } from "vitest";
import type { PdfObject } from "../types/pdf-types/index";
import { PdfType } from "./index";

test("期待する名前の /Type がある場合 ok を返す", () => {
  const entries = new Map<string, PdfObject>([
    ["Type", { type: "name", value: "ObjStm" }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  expect(result).toStrictEqual({ ok: true, value: undefined });
});

test("/Type がない場合 err を返す", () => {
  const entries = new Map<string, PdfObject>();
  const result = PdfType.validate(entries, "ObjStm");
  expect(result.ok).toBe(false);
});

test("/Type が name でない場合 err を返す", () => {
  const entries = new Map<string, PdfObject>([
    ["Type", { type: "integer", value: 1 }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  expect(result.ok).toBe(false);
});

test("/Type の値が期待と異なる場合 err を返す", () => {
  const entries = new Map<string, PdfObject>([
    ["Type", { type: "name", value: "XRef" }],
  ]);
  const result = PdfType.validate(entries, "ObjStm");
  expect(result.ok).toBe(false);
});
