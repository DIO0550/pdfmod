import { expect, test } from "vitest";
import type { ByteOffset, GenerationNumber, ObjectNumber } from "./brand.js";

// --- 同一Brand型間の代入テスト ---

test("ObjectNumber型の値をObjectNumber型の変数に代入できる", () => {
  const a = 1 as ObjectNumber;
  const b: ObjectNumber = a;
  expect(b).toBe(1);
});

test("GenerationNumber型の値をGenerationNumber型の変数に代入できる", () => {
  const a = 0 as GenerationNumber;
  const b: GenerationNumber = a;
  expect(b).toBe(0);
});

test("ByteOffset型の値をByteOffset型の変数に代入できる", () => {
  const a = 1024 as ByteOffset;
  const b: ByteOffset = a;
  expect(b).toBe(1024);
});

// --- 素のnumberからBrand型への代入不可テスト ---

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

// --- 異なるBrand型間の代入不可テスト ---

test("ObjectNumber型の値をGenerationNumber型の変数に代入するとコンパイルエラーになる", () => {
  const obj = 5 as ObjectNumber;
  // @ts-expect-error ObjectNumber is not assignable to GenerationNumber
  const _gen: GenerationNumber = obj;
  expect(_gen).toBe(5);
});

test("ObjectNumber型の値をByteOffset型の変数に代入するとコンパイルエラーになる", () => {
  const obj = 5 as ObjectNumber;
  // @ts-expect-error ObjectNumber is not assignable to ByteOffset
  const _off: ByteOffset = obj;
  expect(_off).toBe(5);
});

test("GenerationNumber型の値をByteOffset型の変数に代入するとコンパイルエラーになる", () => {
  const gen = 0 as GenerationNumber;
  // @ts-expect-error GenerationNumber is not assignable to ByteOffset
  const _off: ByteOffset = gen;
  expect(_off).toBe(0);
});

// --- 算術演算テスト ---

test("Brand型の値は算術演算に使用できる", () => {
  const a = 10 as ObjectNumber;
  const b = 20 as ObjectNumber;

  expect(a + b).toBe(30);
  expect(b - a).toBe(10);
  expect(a * 2).toBe(20);
  expect(b / 2).toBe(10);
});

// --- エントリポイントインポートテスト ---

test("エントリポイントから全Brand型がインポートできる", async () => {
  const mod = await import("../index.js");
  expect(mod).toBeDefined();

  const _obj: import("../index.js").ObjectNumber =
    1 as import("../index.js").ObjectNumber;
  const _gen: import("../index.js").GenerationNumber =
    0 as import("../index.js").GenerationNumber;
  const _off: import("../index.js").ByteOffset =
    512 as import("../index.js").ByteOffset;
  expect(_obj).toBe(1);
  expect(_gen).toBe(0);
  expect(_off).toBe(512);
});
