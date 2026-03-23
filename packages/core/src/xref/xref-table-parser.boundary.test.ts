import { expect, test } from "vitest";
import type { ByteOffset } from "../types/index.js";
import { parseXRefTable } from "./xref-table-parser.js";

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

// --- 入力境界チェック ---

test.each([
  { offset: -1, label: "負数" },
  { offset: 9999, label: "data.length 以上" },
])("offset が $label のとき Err(XREF_TABLE_INVALID) を返す", ({ offset }) => {
  const data = encode("xref\n0 1\n0000000000 00000 n\r\ntrailer");
  const result = parseXRefTable(data, offset as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe("XREF_TABLE_INVALID");
});
