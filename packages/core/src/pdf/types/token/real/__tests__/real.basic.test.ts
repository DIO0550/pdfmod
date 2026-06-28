import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../byte-offset/index";
import { TokenType } from "../../index";
import { TokenReal } from "../index";

test("正の小数の TokenReal を PdfReal に変換する", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: 3.14,
    offset: ByteOffset.of(12),
  };
  const result = TokenReal.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "real", value: 3.14 });
});

test("ゼロの TokenReal を PdfReal に変換する", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: 0,
    offset: ByteOffset.of(0),
  };
  const result = TokenReal.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "real", value: 0 });
});

test("負の小数の TokenReal を PdfReal に変換する", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: -2.5,
    offset: ByteOffset.of(8),
  };
  const result = TokenReal.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "real", value: -2.5 });
});

test("Infinity を素通しする（既存挙動の維持・Number.isFinite を呼ばない）", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: Infinity,
    offset: ByteOffset.of(4),
  };
  const result = TokenReal.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "real", value: Infinity });
});

test("-Infinity を素通しする（既存挙動の維持）", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: -Infinity,
    offset: ByteOffset.of(4),
  };
  const result = TokenReal.toPdfValue(token);
  assert(result.ok);
  assert(result.value.some);
  expect(result.value.value).toEqual({ type: "real", value: -Infinity });
});

test("NaN real token に対し OBJECT_PARSE_UNEXPECTED_TOKEN を返す", () => {
  const token: TokenReal = {
    type: TokenType.Real,
    value: NaN,
    offset: ByteOffset.of(20),
  };
  const result = TokenReal.toPdfValue(token);
  assert(!result.ok);
  assert(result.error.code === "OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toBe("NaN real token at offset 20");
  expect(result.error.offset).toBe(20);
});
