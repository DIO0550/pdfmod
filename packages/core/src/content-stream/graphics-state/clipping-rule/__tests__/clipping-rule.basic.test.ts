import { expect, test } from "vitest";
import { ClippingRule } from "../index";

test("nonzero は nonzero winding number 規則を表す文字列を返す", () => {
  expect(ClippingRule.nonzero()).toBe("nonzero");
});

test("evenOdd は even-odd 規則を表す文字列を返す", () => {
  expect(ClippingRule.evenOdd()).toBe("even-odd");
});

test("nonzero と evenOdd は異なる規則を返す", () => {
  expect(ClippingRule.nonzero()).not.toBe(ClippingRule.evenOdd());
});
