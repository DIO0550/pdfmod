import { expect, test } from "vitest";
import type { ByteOffset } from "../byte-offset/index";
import { ByteOffset as ByteOffsetCompanion } from "../byte-offset/index";
import type { GenerationNumber } from "../generation-number/index";
import { GenerationNumber as GenerationNumberCompanion } from "../generation-number/index";
import type { ObjectNumber } from "../object-number/index";
import { ObjectNumber as ObjectNumberCompanion } from "../object-number/index";

test("ObjectNumber型の値をObjectNumber型の変数に代入できる", () => {
  const a: ObjectNumber = ObjectNumberCompanion.of(1);
  const b: ObjectNumber = a;
  expect(b).toBe(1);
});

test("GenerationNumber型の値をGenerationNumber型の変数に代入できる", () => {
  const a: GenerationNumber = GenerationNumberCompanion.of(0);
  const b: GenerationNumber = a;
  expect(b).toBe(0);
});

test("ByteOffset型の値をByteOffset型の変数に代入できる", () => {
  const a: ByteOffset = ByteOffsetCompanion.of(1024);
  const b: ByteOffset = a;
  expect(b).toBe(1024);
});

test("素のnumberをObjectNumber型の変数に代入するとコンパイルエラーになる", () => {
  const n: number = 42;
  // @ts-expect-error number is not assignable to ObjectNumber
  const _obj: ObjectNumber = n;
  expect(_obj).toBe(42);
});

test("素のnumberをGenerationNumber型の変数に代入するとコンパイルエラーになる", () => {
  const n: number = 0;
  // @ts-expect-error number is not assignable to GenerationNumber
  const _gen: GenerationNumber = n;
  expect(_gen).toBe(0);
});

test("素のnumberをByteOffset型の変数に代入するとコンパイルエラーになる", () => {
  const n: number = 1024;
  // @ts-expect-error number is not assignable to ByteOffset
  const _off: ByteOffset = n;
  expect(_off).toBe(1024);
});

test("ObjectNumber型の値をGenerationNumber型の変数に代入するとコンパイルエラーになる", () => {
  const obj: ObjectNumber = ObjectNumberCompanion.of(5);
  // @ts-expect-error ObjectNumber is not assignable to GenerationNumber
  const _gen: GenerationNumber = obj;
  expect(_gen).toBe(5);
});

test("ObjectNumber型の値をByteOffset型の変数に代入するとコンパイルエラーになる", () => {
  const obj: ObjectNumber = ObjectNumberCompanion.of(5);
  // @ts-expect-error ObjectNumber is not assignable to ByteOffset
  const _off: ByteOffset = obj;
  expect(_off).toBe(5);
});

test("GenerationNumber型の値をByteOffset型の変数に代入するとコンパイルエラーになる", () => {
  const gen: GenerationNumber = GenerationNumberCompanion.of(0);
  // @ts-expect-error GenerationNumber is not assignable to ByteOffset
  const _off: ByteOffset = gen;
  expect(_off).toBe(0);
});

test("Brand型の値は算術演算に使用できる", () => {
  const a = ObjectNumberCompanion.of(10);
  const b = ObjectNumberCompanion.of(20);

  expect(a + b).toBe(30);
  expect(b - a).toBe(10);
  expect(a * 2).toBe(20);
  expect(b / 2).toBe(10);
});

test("エントリポイントから全Brand型がインポートできる", async () => {
  const mod = await import("../index");
  expect(mod).toBeDefined();

  const _obj: import("../index").ObjectNumber = ObjectNumberCompanion.of(1);
  const _gen: import("../index").GenerationNumber =
    GenerationNumberCompanion.of(0);
  const _off: import("../index").ByteOffset = ByteOffsetCompanion.of(512);
  expect(_obj).toBe(1);
  expect(_gen).toBe(0);
  expect(_off).toBe(512);
});
