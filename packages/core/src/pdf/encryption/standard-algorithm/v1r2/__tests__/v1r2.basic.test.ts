import { expect, test } from "vitest";
import { V1R2 } from "../index";

test("V1R2 は40ビット固定の方式として生成される", () => {
  expect(V1R2.create()).toEqual({ kind: "V1R2", keyLength: 40 });
});
