import { expectTypeOf, test } from "vitest";
import type { ExtGStateParameter } from "../index";

test("辞書キーに対応しない値をパラメータへ渡せない", () => {
  expectTypeOf<{
    key: "LC";
    value: number;
  }>().not.toExtend<ExtGStateParameter>();
  expectTypeOf<{
    key: "CA";
    value: number;
  }>().not.toExtend<ExtGStateParameter>();
  expectTypeOf<{
    key: "BM";
    value: string;
  }>().not.toExtend<ExtGStateParameter>();
  expectTypeOf<{
    key: "Font";
    font: string;
    size: number;
  }>().not.toExtend<ExtGStateParameter>();
});
