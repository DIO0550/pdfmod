import { expect, test } from "vitest";
import type { ByteOffset } from "../../pdf/types/byte-offset/index";
import { ByteOffset as ByteOffsetCompanion } from "../../pdf/types/byte-offset/index";
import type { GenerationNumber } from "../../pdf/types/generation-number/index";
import { GenerationNumber as GenerationNumberCompanion } from "../../pdf/types/generation-number/index";
import type { ObjectNumber } from "../../pdf/types/object-number/index";

test("GenerationNumber型の値をObjectNumber型の変数に代入するとコンパイルエラーになる", () => {
  const gen: GenerationNumber = GenerationNumberCompanion.of(0);
  // @ts-expect-error GenerationNumber is not assignable to ObjectNumber
  const _obj: ObjectNumber = gen;
  expect(_obj).toBe(0);
});

test("ByteOffset型の値をObjectNumber型の変数に代入するとコンパイルエラーになる", () => {
  const off: ByteOffset = ByteOffsetCompanion.of(512);
  // @ts-expect-error ByteOffset is not assignable to ObjectNumber
  const _obj: ObjectNumber = off;
  expect(_obj).toBe(512);
});

test("ByteOffset型の値をGenerationNumber型の変数に代入するとコンパイルエラーになる", () => {
  const off: ByteOffset = ByteOffsetCompanion.of(512);
  // @ts-expect-error ByteOffset is not assignable to GenerationNumber
  const _gen: GenerationNumber = off;
  expect(_gen).toBe(512);
});
