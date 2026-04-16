import { expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { TokenType } from "../../../types/index";
import { BufferedTokenizer } from "./index";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test("next() が Tokenizer のトークンを順次返す", () => {
  const bt = new BufferedTokenizer(new Tokenizer(enc("1 2 3")));
  const first = bt.next();
  const second = bt.next();
  const third = bt.next();
  expect(first.type).toBe(TokenType.Integer);
  expect(first.value).toBe(1);
  expect(second.value).toBe(2);
  expect(third.value).toBe(3);
});

test("pushBack() したトークンが次の next() で返される", () => {
  const bt = new BufferedTokenizer(new Tokenizer(enc("42 99")));
  const first = bt.next();
  bt.pushBack(first);
  const again = bt.next();
  expect(again).toBe(first);
  const next = bt.next();
  expect(next.value).toBe(99);
});

test("複数 pushBack() 後の next() 順序は LIFO である", () => {
  const bt = new BufferedTokenizer(new Tokenizer(enc("1 2 3")));
  const t1 = bt.next();
  const t2 = bt.next();
  bt.pushBack(t1);
  bt.pushBack(t2);
  const a = bt.next();
  const b = bt.next();
  expect(a).toBe(t2);
  expect(b).toBe(t1);
});

test("position が内部 Tokenizer の位置を返す", () => {
  const tokenizer = new Tokenizer(enc("abc"));
  const bt = new BufferedTokenizer(tokenizer);
  expect(bt.position).toBe(tokenizer.position);
  bt.next();
  expect(bt.position).toBe(tokenizer.position);
});
