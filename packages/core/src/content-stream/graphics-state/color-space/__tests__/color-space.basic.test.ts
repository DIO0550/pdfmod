import { expect, test } from "vitest";
import { ColorSpace } from "../../color-space";

test.each([
  ["deviceGray", "DeviceGray", ColorSpace.deviceGray],
  ["deviceRGB", "DeviceRGB", ColorSpace.deviceRGB],
  ["deviceCMYK", "DeviceCMYK", ColorSpace.deviceCMYK],
] as const)("ColorSpace.%s() は %s を返す", (_name, expected, factory) => {
  expect(factory()).toBe(expected);
});
