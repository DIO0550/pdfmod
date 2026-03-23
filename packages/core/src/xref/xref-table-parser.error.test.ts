import { expect, test } from "vitest";
import type { ByteOffset } from "../types/index.js";
import { parseXRefTable } from "./xref-table-parser.js";

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

// --- 異常系 ---

test("xref キーワード不在で Err(XREF_TABLE_INVALID) を返す", () => {
  const data = encode("notxref\n0 1\n0000000000 00000 n\r\ntrailer");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("エントリ本体が18バイト未満で Err を返す", () => {
  const data = encode("xref\n0 1\n00000001");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("不正状態フラグ 'x' で Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 x\r\ntrailer");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("trailer 未検出で Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\r\ngarbage");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("offset/generation 間が SPACE でない場合 Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100\t00000 n\r\ntrailer");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("未知 EOL パターンで Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\x00\x00trailer");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("xref がトークン境界なしで連結されている場合 Err を返す", () => {
  const data = encode("xreftrailer");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("xref の前方にトークン境界がない場合 Err を返す", () => {
  const data = encode("ABCxref\n0 1\n0000000100 00000 n\r\ntrailer");
  const result = parseXRefTable(data, 3 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("trailers のような連結文字列を trailer として誤認しない", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\r\ntrailers");
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});

test("サブセクションヘッダのオブジェクト番号がオーバーフローする場合 Err を返す", () => {
  const data = encode(
    "xref\n9007199254740993 1\n0000000100 00000 n\r\ntrailer",
  );
  const result = parseXRefTable(data, 0 as ByteOffset);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: { code: string } }).error.code).toBe(
    "XREF_TABLE_INVALID",
  );
});
