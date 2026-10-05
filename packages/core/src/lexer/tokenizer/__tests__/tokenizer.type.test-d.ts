import { expectTypeOf, test } from "vitest";
import type { LexicalToken } from "../../../pdf/types/index";
import type { Tokenizer } from "../index";

test("字句解析は字句トークンを1つ返す", () => {
  expectTypeOf<Tokenizer["nextToken"]>().returns.toEqualTypeOf<LexicalToken>();
});

test("字句解析の一括読み取りは字句トークンの配列を返す", () => {
  expectTypeOf<Tokenizer["tokenize"]>().returns.toEqualTypeOf<LexicalToken[]>();
});
