import { assert, expect, test } from "vitest";
import type { ByteOffset } from "../../types/index.js";
import { parseTrailer } from "./trailer-parser.js";

const encoder = new TextEncoder();

function encode(s: string): Uint8Array {
  return encoder.encode(s);
}

function trailerAt(
  content: string,
  offset = 0,
): { data: Uint8Array; offset: ByteOffset } {
  return { data: encode(content), offset: offset as ByteOffset };
}

test("指定オフセットにtrailerキーワードが存在しない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data } = trailerAt("not_trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, 0 as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("offset < 0 の場合にエラーが返る", () => {
  const { data } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, -1 as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("offset >= data.length の場合にエラーが返る", () => {
  const { data } = trailerAt("trailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, data.length as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("trailersのようにキーワード直後が非境界文字の場合にエラーが返る", () => {
  const { data } = trailerAt("trailers << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, 0 as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("xtrailerのようにキーワード直前が非境界文字の場合にエラーが返る", () => {
  const data = encode("xtrailer << /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, 1 as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("/Rootがない辞書に対してROOT_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.message).toContain("/Root");
});

test("/Rootが非間接参照の場合にROOT_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root /Catalog /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.message).toContain("indirect reference");
});

test("/Sizeがない辞書に対してSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("/Size");
});

test("/Sizeが非整数の場合にSIZE_NOT_FOUNDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 1.5 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.message).toContain("non-negative integer");
});

test("/IDが1要素の場合にエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [<abc123>] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/ID");
});

test("/IDの要素が非文字列の場合にエラーが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /ID [1 2] >>",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("/ID");
});

test("<<が見つからない場合にXREF_TABLE_INVALIDエラーが返る", () => {
  const { data, offset } = trailerAt("trailer /Root 1 0 R /Size 10 >>");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
  expect(result.error.message).toContain("<<");
});

test(">>が見つからない(EOF到達)場合にエラーが返る", () => {
  const { data, offset } = trailerAt("trailer << /Root 1 0 R /Size 10");
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("未知キーの値が未閉鎖の配列の場合にErrが返る", () => {
  const { data, offset } = trailerAt(
    "trailer << /Root 1 0 R /Size 10 /Unknown [1 2",
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("XREF_TABLE_INVALID");
});

test("65段ネストの配列でNESTING_TOO_DEEPエラーが返る", () => {
  const depth = 65;
  const open = "[".repeat(depth);
  const close = "]".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Unknown ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(!result.ok);
  expect(result.error.code).toBe("NESTING_TOO_DEEP");
});

test("64段ネストの配列は正常にパースされる", () => {
  const depth = 64;
  const open = "[".repeat(depth);
  const close = "]".repeat(depth);
  const { data, offset } = trailerAt(
    `trailer << /Root 1 0 R /Size 10 /Unknown ${open}1${close} >>`,
  );
  const result = parseTrailer(data, offset);
  assert(result.ok);
});

test("エラー発生時のoffsetがファイル内の正しいバイト位置を指している", () => {
  const prefix = "        ";
  const content = `${prefix}trailer << /Size 10 >>`;
  const data = encode(content);
  const result = parseTrailer(data, prefix.length as ByteOffset);
  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
});
