import { expect, test } from "vitest";
import { V1R3 } from "../index";

test("V1R3 は40ビット固定の方式として生成される", () => {
  expect(V1R3.create()).toEqual({ kind: "V1R3", keyLength: 40 });
});
