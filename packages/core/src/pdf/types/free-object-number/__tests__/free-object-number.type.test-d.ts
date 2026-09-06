import { test } from "vitest";
import { FreeObjectNumber, ObjectNumber } from "../../../../index";

test("ObjectNumber を FreeObjectNumber に代入できない", () => {
  // @ts-expect-error ObjectNumber と FreeObjectNumber は別のブランド型
  const value: FreeObjectNumber = ObjectNumber.of(1);
  void value;
});

test("FreeObjectNumber を ObjectNumber に代入できない", () => {
  // @ts-expect-error FreeObjectNumber は 0 を含むため ObjectNumber では表現できない
  const value: ObjectNumber = FreeObjectNumber.of(0);
  void value;
});
