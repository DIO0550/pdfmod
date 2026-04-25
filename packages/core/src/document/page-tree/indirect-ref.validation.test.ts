import { expect, test } from "vitest";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../pdf/types/object-number/index";
import { IndirectRef } from "./indirect-ref";
import { indirectRefValue } from "./page-tree-walker.test.helpers";

test("IndirectRef.from は objectNumber が 0 のとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(0, 0))).toEqual({ some: false });
});

test("IndirectRef.from は objectNumber が負数のとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(-1, 0))).toEqual({ some: false });
});

test("IndirectRef.from は objectNumber が非整数のとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(1.5, 0))).toEqual({ some: false });
});

test("IndirectRef.from は generationNumber が負数のとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(1, -1))).toEqual({ some: false });
});

test("IndirectRef.from は generationNumber が非整数のとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(1, 0.5))).toEqual({ some: false });
});

test("IndirectRef.from は generationNumber が 65535 を超えるとき None を返す", () => {
  expect(IndirectRef.from(indirectRefValue(1, 65536))).toEqual({ some: false });
});

test("IndirectRef.from は objectNumber=1, generationNumber=0 のとき Some を返す", () => {
  expect(IndirectRef.from(indirectRefValue(1, 0))).toEqual({
    some: true,
    value: {
      objectNumber: ObjectNumber.of(1),
      generationNumber: GenerationNumber.of(0),
    },
  });
});

test("IndirectRef.from は ブランド型として objectNumber と generationNumber を保持する", () => {
  expect(IndirectRef.from(indirectRefValue(7, 3))).toEqual({
    some: true,
    value: {
      objectNumber: ObjectNumber.of(7),
      generationNumber: GenerationNumber.of(3),
    },
  });
});
