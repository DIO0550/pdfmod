import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../types/byte-offset/index";
import { parseXRefTable } from "./index";

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}

// --- 異常系 ---

test("xref キーワード不在で Err(XREF_TABLE_INVALID) を返す", () => {
  const data = encode("notxref\n0 1\n0000000000 00000 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("エントリ本体が18バイト未満で Err を返す", () => {
  const data = encode("xref\n0 1\n00000001");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("不正状態フラグ 'x' で Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 x\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("trailer 未検出で Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\r\ngarbage");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("offset/generation 間が SPACE でない場合 Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100\t00000 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("未知 EOL パターンで Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\x00\x00trailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("xref がトークン境界なしで連結されている場合 Err を返す", () => {
  const data = encode("xreftrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("xref の前方にトークン境界がない場合 Err を返す", () => {
  const data = encode("ABCxref\n0 1\n0000000100 00000 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(3));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("trailers のような連結文字列を trailer として誤認しない", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n\r\ntrailers");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("サブセクションヘッダのオブジェクト番号がオーバーフローする場合 Err を返す", () => {
  const data = encode(
    "xref\n9007199254740993 1\n0000000100 00000 n\r\ntrailer",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("generation桁が4桁しかない場合 Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 0000  n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("generation後にSPACEでなくTABがある場合 Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000\tn\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("エントリ本体後にEOLがなくデータ終了する場合 Err を返す", () => {
  const data = encode("xref\n0 1\n0000000100 00000 n");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("サブセクションヘッダにcount数字列がない場合 Err を返す", () => {
  const data = encode("xref\n0 \n0000000100 00000 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("サブセクションヘッダのentry countがオーバーフローする場合 Err を返す", () => {
  const data = encode(
    "xref\n0 9007199254740993\n0000000100 00000 n\r\ntrailer",
  );
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("世代番号が65535を超える場合 Err(XREF_TABLE_INVALID) を返す", () => {
  const data = encode("xref\n0 1\n0000000100 65536 n\r\ntrailer");
  const result = parseXRefTable(data, ByteOffset.of(0));
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});
