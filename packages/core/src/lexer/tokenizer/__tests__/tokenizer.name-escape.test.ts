import { assert, expect, test } from "vitest";
import { TokenType } from "../../../pdf/types/index";
import { Tokenizer } from "../index";

/**
 * 先頭トークンをNameとして読み取り、その値を返す。
 *
 * @param source - トークナイズ対象のソース文字列
 * @returns 先頭のNameトークンの値
 */
function tokenizeName(source: string): string {
  const tokenizer = new Tokenizer(new TextEncoder().encode(source));
  const token = tokenizer.nextToken();
  assert(token.type === TokenType.Name);
  return token.value;
}

test.each([
  ["/Font#20Name", "Font Name"],
  ["/A#42", "AB"],
  ["/A#4a", "AJ"],
  ["/A#4A", "AJ"],
  ["/paired#28#29parentheses", "paired()parentheses"],
])("正当なエスケープ %s をデコードする", (input, expected) => {
  expect(tokenizeName(input)).toBe(expected);
});

test.each([
  ["/A#zz", "A#zz"],
  ["/A#4z", "A#4z"],
  ["/A#z4", "A#z4"],
  ["/A#GG", "A#GG"],
])("非16進数字が続く %s は # をリテラル扱いする", (input, expected) => {
  expect(tokenizeName(input)).toBe(expected);
});

test.each([
  ["/A#", "A#"],
  ["/A#4", "A#4"],
  ["/#", "#"],
])("入力末尾で2桁取れない %s は # をリテラル扱いする", (input, expected) => {
  expect(tokenizeName(input)).toBe(expected);
});

test.each([
  ["/A#4 B", "A#4"],
  ["/A#4/B", "A#4"],
  ["/A# B", "A#"],
  ["/A#/B", "A#"],
])("エスケープ途中で区切り文字が来る %s は名前をそこで終える", (input, expected) => {
  expect(tokenizeName(input)).toBe(expected);
});

test.each([
  ["/A#00B", "A#00B"],
  ["/#00", "#00"],
])("ISO 32000-2 が禁止する %s は # をリテラル扱いする", (input, expected) => {
  expect(tokenizeName(input)).toBe(expected);
});

test("不正エスケープの直後の正当なエスケープはデコードされる", () => {
  expect(tokenizeName("/A#zz#42")).toBe("A#zzB");
});

/** ISO 32000-2 §7.3.5 が名前オブジェクトで禁止するNUL文字。 */
const NulChar = String.fromCharCode(0);

test("不正エスケープでNUL文字が名前に混入しない", () => {
  expect(tokenizeName("/A#GG")).not.toContain(NulChar);
});
