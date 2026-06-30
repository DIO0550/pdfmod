import { expect, test } from "vitest";
import { MarkedContentStack } from "../index";

test("空stackのpopはnoneを返す", () => {
  // 空 stack に対する pop は throw せず Option の none を返す
  const stack = MarkedContentStack.create();
  expect(MarkedContentStack.pop(stack)).toEqual({ some: false });
});

test("空stackのdepthは0", () => {
  // create() 直後の境界値: depth は 0
  expect(MarkedContentStack.depth(MarkedContentStack.create())).toBe(0);
});
