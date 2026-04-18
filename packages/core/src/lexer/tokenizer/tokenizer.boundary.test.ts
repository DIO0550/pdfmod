import { expect, test } from "vitest";
import type { Token } from "../../pdf/types/index";
import { TokenType } from "../../pdf/types/index";
import { Tokenizer } from "./index";

function tokenize(input: string): Token[] {
  const encoder = new TextEncoder();
  const tokenizer = new Tokenizer(encoder.encode(input));
  return tokenizer.tokenize();
}

test("コメントをスキップする", () => {
  const tokens = tokenize("42 % this is a comment\n17");
  expect(tokens[0]).toMatchObject({ type: TokenType.Integer, value: 42 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Integer, value: 17 });
  expect(tokens[2]).toMatchObject({ type: TokenType.EOF });
});

test("空入力でEOFトークンを生成する", () => {
  const tokens = tokenize("");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe(TokenType.EOF);
});

test("正しいオフセットを記録する", () => {
  const tokens = tokenize("/Name 42");
  expect(tokens[0].offset).toBe(0);
  expect(tokens[1].offset).toBe(6);
});

test("小数境界 1. を Real としてトークナイズする", () => {
  const tokens = tokenize("1.");
  expect(tokens[0]).toMatchObject({ type: TokenType.Real, value: 1.0 });
});

test("小数境界 -.5 を Real としてトークナイズする", () => {
  const tokens = tokenize("-.5");
  expect(tokens[0]).toMatchObject({ type: TokenType.Real, value: -0.5 });
});

test("空白のみの入力はEOFのみを返す", () => {
  const tokens = tokenize("   \t\n  ");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe(TokenType.EOF);
});

test.each([
  [
    "42 /Name true",
    [
      { type: TokenType.Integer, value: 42, offset: 0 },
      { type: TokenType.Name, value: "Name", offset: 3 },
      { type: TokenType.Boolean, value: true, offset: 9 },
      { type: TokenType.EOF, value: null, offset: 13 },
    ],
  ],
  [
    "<< /K 1 >>",
    [
      { type: TokenType.DictBegin, value: "<<", offset: 0 },
      { type: TokenType.Name, value: "K", offset: 3 },
      { type: TokenType.Integer, value: 1, offset: 6 },
      { type: TokenType.DictEnd, value: ">>", offset: 8 },
      { type: TokenType.EOF, value: null, offset: 10 },
    ],
  ],
])("offset検証テーブル駆動: %s", (input, expected) => {
  const tokens = tokenize(input);
  expected.forEach((exp, i) => {
    expect(tokens[i]).toMatchObject(exp);
  });
});
