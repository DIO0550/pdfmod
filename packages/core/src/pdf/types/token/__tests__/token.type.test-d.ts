import { expectTypeOf, test } from "vitest";
import type { ContentStreamToken, LexicalToken } from "../../../../index";
import type { BufferedTokenizer } from "../../../../objects/object-parser/buffered-tokenizer/index";
import type { Operator, TokenInlineImageDictEntry, TokenType } from "../index";

test("字句トークンに演算子とインライン画像は含まれない", () => {
  expectTypeOf<
    Extract<LexicalToken, { type: TokenType.Operator | TokenType.InlineImage }>
  >().toBeNever();
});

test("コンテンツストリームのトークンは字句トークンと演算子・インライン画像を含む", () => {
  expectTypeOf<LexicalToken>().toExtend<ContentStreamToken>();
  expectTypeOf<Operator>().toExtend<ContentStreamToken>();
  expectTypeOf<
    Extract<ContentStreamToken, { type: TokenType.InlineImage }>
  >().not.toBeNever();
});

test("演算子の綴りはvalueで公開される", () => {
  expectTypeOf<Operator>().toHaveProperty("value").toEqualTypeOf<string>();
  expectTypeOf<Operator>().not.toHaveProperty("name");
});

test("オブジェクト解析の巻き戻しバッファは字句トークンだけを受け取る", () => {
  expectTypeOf<
    BufferedTokenizer["next"]
  >().returns.toEqualTypeOf<LexicalToken>();
  expectTypeOf<BufferedTokenizer["pushBack"]>()
    .parameter(0)
    .toEqualTypeOf<LexicalToken>();
});

test("インライン画像の辞書値は字句トークンの列である", () => {
  expectTypeOf<TokenInlineImageDictEntry["value"]>().toEqualTypeOf<
    ReadonlyArray<LexicalToken>
  >();
});
