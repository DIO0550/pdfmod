import { expect, test } from "vitest";
import { skipWhitespaceAndComments } from "./pdf-bytes.js";

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

test("LF終端のコメントをスキップする", () => {
  const data = encode("%comment\nA");
  expect(skipWhitespaceAndComments(data, 0)).toBe(9);
});

test("CR終端のコメントをスキップする", () => {
  const data = encode("%comment\rA");
  expect(skipWhitespaceAndComments(data, 0)).toBe(9);
});

test("CRLF終端のコメントをスキップする", () => {
  const data = encode("%comment\r\nA");
  expect(skipWhitespaceAndComments(data, 0)).toBe(10);
});

test("end引数でスキップ範囲を制限する", () => {
  const data = encode("  ABC");
  expect(skipWhitespaceAndComments(data, 0, 1)).toBe(1);
});
