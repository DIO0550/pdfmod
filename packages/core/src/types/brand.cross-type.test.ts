import { expect, test } from "vitest";
import type { ByteOffset, GenerationNumber, ObjectNumber } from "./brand.js";

test("GenerationNumber型の値をObjectNumber型の変数に代入するとコンパイルエラーになる", () => {
  const gen = 0 as GenerationNumber;
  // @ts-expect-error GenerationNumber is not assignable to ObjectNumber
  const _obj: ObjectNumber = gen;
  expect(_obj).toBe(0);
});

test("ByteOffset型の値をObjectNumber型の変数に代入するとコンパイルエラーになる", () => {
  const off = 512 as ByteOffset;
  // @ts-expect-error ByteOffset is not assignable to ObjectNumber
  const _obj: ObjectNumber = off;
  expect(_obj).toBe(512);
});

test("ByteOffset型の値をGenerationNumber型の変数に代入するとコンパイルエラーになる", () => {
  const off = 512 as ByteOffset;
  // @ts-expect-error ByteOffset is not assignable to GenerationNumber
  const _gen: GenerationNumber = off;
  expect(_gen).toBe(512);
});
