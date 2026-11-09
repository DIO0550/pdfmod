import { expect, test } from "vitest";
import { none } from "../../../utils/option/index";
import { ColorSpace } from "../../graphics-state/color-space/index";
import { ColorOperation } from "../index";

test.each([
  "sc",
  "SC",
] as const)("Pattern色空間に%sで色を指定すると不正な命令になる", (operatorName) => {
  const error = ColorOperation.operatorError({
    colorSpace: { family: "Pattern", base: none },
    operatorName,
  });

  expect(error).toEqual({
    some: true,
    value: {
      code: "OPERATOR_ILLEGAL_STATE",
      operatorName,
      message: "Pattern colors require scn or SCN",
    },
  });
});

test.each([
  "scn",
  "SCN",
] as const)("Pattern色空間に%sで色を指定できる", (operatorName) => {
  const error = ColorOperation.operatorError({
    colorSpace: { family: "Pattern", base: none },
    operatorName,
  });

  expect(error).toEqual(none);
});

test.each([
  "sc",
  "SC",
  "scn",
  "SCN",
] as const)("RGB色空間に%sで色を指定できる", (operatorName) => {
  const error = ColorOperation.operatorError({
    colorSpace: ColorSpace.deviceRGB(),
    operatorName,
  });

  expect(error).toEqual(none);
});
