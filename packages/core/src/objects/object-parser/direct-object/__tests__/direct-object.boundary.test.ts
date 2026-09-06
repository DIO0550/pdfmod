import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import { BufferedTokenizer } from "../../buffered-tokenizer/index";
import { DirectObject } from "../index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const btOf = (s: string): BufferedTokenizer =>
  new BufferedTokenizer(new Tokenizer(enc(s)));

test("0 G R はエラーではなく null オブジェクトに畳まれる", () => {
  const result = DirectObject.parse(btOf("0 0 R"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "null" });
});

test("正整数のオブジェクト番号は従来どおり indirect-ref を返す", () => {
  const result = DirectObject.parse(btOf("1 0 R"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({
    type: "indirect-ref",
    objectNumber: 1,
    generationNumber: 0,
  });
});

test("配列要素の 0 G R は null 要素になる", () => {
  const result = DirectObject.parse(btOf("[ 0 0 R ]"), ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({
    type: "array",
    elements: [{ type: "null" }],
  });
});

// TS の readValue は null をキーごと落とさず値として保持する。
// Rust の parse_dictionary_body は ISO 32000-1 §7.3.7 に従いキーごと削除するため、
// 辞書レベルの結果は両実装で異なる（本 Issue のスコープ外・別 Issue へ申し送り）。
test("辞書値の 0 G R はキーを残したまま null 値になる", () => {
  const result = DirectObject.parse(
    btOf("<< /Foo 0 0 R >>"),
    ByteOffset.of(0),
    0,
  );
  assert(result.ok && result.value.type === "dictionary");
  expect(result.value.entries.get("Foo")).toEqual({ type: "null" });
});
