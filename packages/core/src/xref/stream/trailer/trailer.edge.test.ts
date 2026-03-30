import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../types/index";
import { buildXRefStreamTrailerDict } from "./index";

const validRoot: PdfObject = {
  type: "indirect-ref",
  objectNumber: 1,
  generationNumber: 0,
};
const validSize: PdfObject = { type: "integer", value: 10 };

test("未知のキーが含まれていても無視して正常に構築する", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Type", { type: "name", value: "XRef" }],
    ["W", { type: "array", elements: [] }],
    ["Filter", { type: "name", value: "FlateDecode" }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  assert(result.ok);
  expect(result.value.root.objectNumber).toBe(1);
  expect(result.value.size).toBe(10);
});

test("/Prevが0の場合に正常にByteOffsetとして扱う（境界値）", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", validSize],
    ["Prev", { type: "integer", value: 0 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  assert(result.ok);
  expect(result.value.prev).toBe(0);
});

test("/Sizeが0の場合に正常に構築する（境界値）", () => {
  const dict = new Map<string, PdfObject>([
    ["Root", validRoot],
    ["Size", { type: "integer", value: 0 }],
  ]);
  const result = buildXRefStreamTrailerDict(dict);
  assert(result.ok);
  expect(result.value.size).toBe(0);
});
