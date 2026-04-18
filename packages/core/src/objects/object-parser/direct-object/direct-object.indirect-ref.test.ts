import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";
import { DirectObject } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("integer 単体では integer を返す", () => {
  const result = DirectObject.parse(btOf("5 (str)"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 5 });
});

test("N G R パターンで indirect-ref を返す", () => {
  const result = DirectObject.parse(btOf("5 0 R"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({
    type: "indirect-ref",
    objectNumber: 5,
    generationNumber: 0,
  });
});

test("N G 非R の場合、先読みしたトークンは巻き戻されて次のパースに影響しない", () => {
  const bt = btOf("5 0 obj");
  const first = DirectObject.parse(bt, ByteOffset.of(0), 0);
  assert(first.ok);
  expect(first.value).toEqual({ type: "integer", value: 5 });
  const second = DirectObject.parse(bt, ByteOffset.of(0), 0);
  assert(second.ok);
  expect(second.value).toEqual({ type: "integer", value: 0 });
});

test("負の object number で indirect-ref を試行するとエラー", () => {
  const result = DirectObject.parse(btOf("-1 0 R"), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});

test("負の generation number で indirect-ref を試行するとエラー", () => {
  const result = DirectObject.parse(btOf("1 -1 R"), ByteOffset.of(0), 0);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
});
