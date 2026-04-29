import { expect, test } from "vitest";
import {
  isPdfDelimiter,
  isPdfLineBreak,
  isPdfTokenBoundary,
  isPdfWhitespace,
  skipWhitespaceAndComments,
} from "./index";

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

// --- isPdfWhitespace edge cases ---

test.each([
  [0x00, true],
  [0x09, true],
  [0x0a, true],
  [0x0c, true],
  [0x0d, true],
  [0x20, true],
])("isPdfWhitespace(0x%s) は %s を返す", (byte, expected) => {
  expect(isPdfWhitespace(byte)).toBe(expected);
});

test.each([
  [0x01],
  [0x08],
  [0x0b],
  [0x0e],
  [0x1f],
  [0x21],
])("isPdfWhitespace(0x%s) は false を返す", (byte) => {
  expect(isPdfWhitespace(byte)).toBe(false);
});

// --- isPdfDelimiter edge cases ---

test.each([
  [0x28],
  [0x29],
  [0x3c],
  [0x3e],
  [0x5b],
  [0x5d],
  [0x7b],
  [0x7d],
  [0x2f],
  [0x25],
])("isPdfDelimiter(0x%s) は true を返す", (byte) => {
  expect(isPdfDelimiter(byte)).toBe(true);
});

test.each([
  [0x41],
  [0x30],
  [0x20],
  [0x00],
])("isPdfDelimiter(0x%s) は false を返す", (byte) => {
  expect(isPdfDelimiter(byte)).toBe(false);
});

// --- isPdfTokenBoundary edge cases ---

test("isPdfTokenBoundary はホワイトスペースに true を返す", () => {
  expect(isPdfTokenBoundary(0x20)).toBe(true);
});

test("isPdfTokenBoundary はデリミタに true を返す", () => {
  expect(isPdfTokenBoundary(0x28)).toBe(true);
});

test("isPdfTokenBoundary は通常文字に false を返す", () => {
  expect(isPdfTokenBoundary(0x41)).toBe(false);
});

test.each([[0x0a], [0x0d]])("isPdfLineBreak(0x%s) は true を返す", (byte) => {
  expect(isPdfLineBreak(byte)).toBe(true);
});

test.each([
  [0x20],
  [0x09],
  [0x00],
  [0x0c],
  [0x41],
])("isPdfLineBreak(0x%s) は false を返す", (byte) => {
  expect(isPdfLineBreak(byte)).toBe(false);
});

// --- skipWhitespaceAndComments edge cases ---

test("改行なしEOFコメントをスキップする", () => {
  const data = encode("%comment");
  expect(skipWhitespaceAndComments(data, 0)).toBe(8);
});

test("連続コメントをスキップする", () => {
  const data = encode("%first\n%second\nA");
  expect(skipWhitespaceAndComments(data, 0)).toBe(15);
});

test("pos === end のケースで即座に返す", () => {
  const data = encode("ABC");
  expect(skipWhitespaceAndComments(data, 3, 3)).toBe(3);
});

test("endがコメント途中のケースで途中まで進む", () => {
  const data = encode("%comment\nA");
  expect(skipWhitespaceAndComments(data, 0, 5)).toBe(5);
});

test("開始位置が非空白のケースで即座に返す", () => {
  const data = encode("ABC");
  expect(skipWhitespaceAndComments(data, 0)).toBe(0);
});
