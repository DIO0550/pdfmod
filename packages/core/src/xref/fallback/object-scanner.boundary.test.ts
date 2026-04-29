import { expect, test } from "vitest";
import { scanObjectHeaders } from "./object-scanner";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("`object` のような部分一致は検出しない", () => {
  const data = encode("object reference 1 0 OBJX\n");
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("`obj` を含まないデータは空配列を返す", () => {
  const data = encode("no headers here, just plain text\n");
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("空の Uint8Array に対して空配列を返す", () => {
  const data = new Uint8Array(0);
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});

test("負記号を含む壊れ入力 `0 -1 obj` は hits にも skipped にも残らない", () => {
  const data = encode("0 -1 obj\n<<>>\nendobj\n");
  const report = scanObjectHeaders(data);
  expect(report).toEqual({ hits: [], skipped: [] });
});

test.each([
  ["abc1 0 obj\n"],
  ["xref1 0 obj\n"],
])("ヘッダ先頭の直前にトークン境界が無い場合は検出しない: %s", (source) => {
  const data = encode(source);
  expect(scanObjectHeaders(data)).toEqual({ hits: [], skipped: [] });
});
