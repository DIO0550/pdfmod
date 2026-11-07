import { expect, expectTypeOf, test } from "vitest";
import { BlendMode, BlendModes } from "../index";

test.each(
  Object.values(BlendModes),
)("標準ブレンドモード %s を認識する", (value) => {
  expect(BlendMode.fromName(value)).toEqual({ some: true, value });
});

test("Compatible は Normal として解釈する", () => {
  expect(BlendMode.fromName("Compatible")).toEqual({
    some: true,
    value: "Normal",
  });
});

test("未知のモードは標準モードとして受理しない", () => {
  expect(BlendMode.fromName("Future")).toEqual({ some: false });
  expectTypeOf<string>().not.toExtend<BlendMode>();
});
