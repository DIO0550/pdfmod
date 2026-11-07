import { expect, expectTypeOf, test } from "vitest";
import { none, some } from "../../../../utils/option/index";
import { TextFont } from "../index";

test("辞書で指定したフォントにはローカル名がない", () => {
  const font: TextFont = {
    type: "dictionary",
    dictionary: { type: "dictionary", entries: new Map() },
  };

  expect(TextFont.nameOf(some(font))).toEqual(none);
  expectTypeOf<{ type: "dictionary"; name: string }>().not.toExtend<TextFont>();
});

test("名前で指定したフォントだけがローカル名を持つ", () => {
  expect(TextFont.nameOf(some({ type: "name", name: "F1" }))).toEqual(
    some("F1"),
  );
  expect(TextFont.nameOf(none)).toEqual(none);
});
