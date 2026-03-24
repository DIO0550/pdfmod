import { expect, test } from "vitest";
import { skipWhitespaceAndComments } from "./pdf-bytes.js";

test("NUL+TAB+コメント+ホワイトスペースの連鎖をスキップする", () => {
  const data = new Uint8Array([
    0x00, // NUL
    0x09, // TAB
    0x25,
    0x63,
    0x6f,
    0x6d,
    0x0a, // %com\n
    0x20, // SPACE
    0x41, // 'A'
  ]);
  expect(skipWhitespaceAndComments(data, 0)).toBe(8);
});

test("FF+複数コメント+CRLFの連鎖をスキップする", () => {
  // FF(1) + %a\r\n(4) + %b\n(3) = 8バイトスキップ → 'B'はindex 8
  const data = new Uint8Array([
    0x0c, // FF         [0]
    0x25,
    0x61,
    0x0d,
    0x0a, // %a\r\n  [1-4]
    0x25,
    0x62,
    0x0a, // %b\n          [5-7]
    0x42, // 'B'        [8]
  ]);
  expect(skipWhitespaceAndComments(data, 0)).toBe(8);
});
