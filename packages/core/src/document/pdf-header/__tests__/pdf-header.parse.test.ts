import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../pdf/types/index";
import { PdfHeader } from "../index";

test("先頭に %PDF-1.7 がある入力で offset 0 と version 1.7 を返す", () => {
  const data = new TextEncoder().encode("%PDF-1.7\n%binary\n");
  const result = PdfHeader.parse(data);

  assert(result.ok);
  expect(result.value.offset).toBe(ByteOffset.of(0));
  expect(result.value.version as string).toBe("1.7");
});

test("前置ゴミ（100バイト）がある入力で正しい offset と version を返す", () => {
  const junk = new Uint8Array(100).fill(0x20);
  const pdf = new TextEncoder().encode("%PDF-2.0\n");
  const combined = new Uint8Array(junk.length + pdf.length);
  combined.set(junk, 0);
  combined.set(pdf, junk.length);

  const result = PdfHeader.parse(combined);

  assert(result.ok);
  expect(result.value.offset).toBe(ByteOffset.of(100));
  expect(result.value.version as string).toBe("2.0");
});

test("走査上限 1024 バイト内で最大オフセット（1019バイト目）にあるヘッダを検出できる", () => {
  const junk = new Uint8Array(1019).fill(0x61);
  const pdf = new TextEncoder().encode("%PDF-1.4\n");
  const combined = new Uint8Array(junk.length + pdf.length);
  combined.set(junk, 0);
  combined.set(pdf, junk.length);

  const result = PdfHeader.parse(combined);

  assert(result.ok);
  expect(result.value.offset).toBe(ByteOffset.of(1019));
  expect(result.value.version as string).toBe("1.4");
});

test("走査上限（1020バイト目）を超えるヘッダは INVALID_HEADER を返す", () => {
  const junk = new Uint8Array(1020).fill(0x61);
  const pdf = new TextEncoder().encode("%PDF-1.4\n");
  const combined = new Uint8Array(junk.length + pdf.length);
  combined.set(junk, 0);
  combined.set(pdf, junk.length);

  const result = PdfHeader.parse(combined);

  assert(!result.ok);
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("不正なバージョン文字列は INVALID_HEADER を返す", () => {
  const data = new TextEncoder().encode("%PDF-9.9\n");
  const result = PdfHeader.parse(data);

  assert(!result.ok);
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("%PDF- シグネチャ長未満の極小データは INVALID_HEADER を返す", () => {
  const data = new TextEncoder().encode("%PD");
  const result = PdfHeader.parse(data);

  assert(!result.ok);
  expect(result.error.code).toBe("INVALID_HEADER");
});

test("各種 whitespace（TAB, CR, LF, SPACE）区切りのヘッダから正しくバージョンを抽出できる", () => {
  for (const ws of ["\t", "\r", "\n", " "]) {
    const data = new TextEncoder().encode(`%PDF-1.7${ws}rest-of-file`);
    const result = PdfHeader.parse(data);

    assert(result.ok);
    expect(result.value.version as string).toBe("1.7");
    expect(result.value.offset).toBe(ByteOffset.of(0));
  }
});
