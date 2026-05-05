import { expect, test } from "vitest";
import { ByteOffset } from "../byte-offset/index";
import { Operator, TokenType, tokenDisplayString } from "./index";

test("Operator.of は TokenType.Operator variant を返す", () => {
  const op = Operator.of("m", ByteOffset.of(0));
  expect(op).toEqual({ type: TokenType.Operator, name: "m", offset: 0 });
});

test("Operator.of は与えた name/offset をそのまま保持する", () => {
  const op = Operator.of("BT", ByteOffset.of(128));
  expect(op.name).toBe("BT");
  expect(op.offset).toBe(128);
});

test("Operator.of は空文字 name でも variant を返す", () => {
  const op = Operator.of("", ByteOffset.of(0));
  expect(op.name).toBe("");
  expect(op.type).toBe(TokenType.Operator);
});

test("TokenType.Operator メンバが定義されている", () => {
  expect(TokenType.Operator).toBe("Operator");
});

test("TokenType.InlineImage メンバが定義されている", () => {
  expect(TokenType.InlineImage).toBe("InlineImage");
});

test("tokenDisplayString は Operator に対して name を返す", () => {
  const op = Operator.of("BT", ByteOffset.of(0));
  expect(tokenDisplayString(op)).toBe("BT");
});

test("tokenDisplayString は InlineImage に対して省略表現を返す", () => {
  expect(
    tokenDisplayString({
      type: TokenType.InlineImage,
      dict: [],
      data: new Uint8Array(),
      offset: ByteOffset.of(0),
    }),
  ).toBe("BI ... ID ... EI");
});

test("tokenDisplayString は Integer に対して数値の文字列化を返す", () => {
  expect(
    tokenDisplayString({
      type: TokenType.Integer,
      value: 42,
      offset: ByteOffset.of(0),
    }),
  ).toBe("42");
});

test("tokenDisplayString は Keyword に対して keyword 文字列を返す", () => {
  expect(
    tokenDisplayString({
      type: TokenType.Keyword,
      value: "obj",
      offset: ByteOffset.of(0),
    }),
  ).toBe("obj");
});

test('tokenDisplayString は Null variant に対して "null" を返す', () => {
  expect(
    tokenDisplayString({
      type: TokenType.Null,
      value: null,
      offset: ByteOffset.of(0),
    }),
  ).toBe("null");
});

test('tokenDisplayString は EOF variant に対して "null" を返す', () => {
  expect(
    tokenDisplayString({
      type: TokenType.EOF,
      value: null,
      offset: ByteOffset.of(0),
    }),
  ).toBe("null");
});
