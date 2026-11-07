import { expect, test } from "vitest";
import { SoftMask } from "../index";

test("None 以外の名前はソフトマスクの解除にならない", () => {
  expect(SoftMask.fromObject({ type: "name", value: "Invalid" })).toEqual({
    some: false,
  });
  expect(SoftMask.fromObject({ type: "name", value: "None" })).toEqual({
    some: true,
    value: { type: "None" },
  });
});
