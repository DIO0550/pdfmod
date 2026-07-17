import { expect, test } from "vitest";
import type { Option } from "../../option/index";
import { none, some } from "../../option/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { toOption, toResult } from "../index";

// IsExact: 型 A と B が完全一致するかをコンパイル時に判定するヘルパー。
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;
type Assert<T extends true> = T;

test("toOptionはok(null)を型レベルで拒否する", () => {
  // @ts-expect-error null は NonNullable<unknown> 制約に違反する
  const result = toOption(ok(null));
  expect(result).toEqual({ some: true, value: null });
});

test("toOptionはok(undefined)を型レベルで拒否する", () => {
  // @ts-expect-error undefined は NonNullable<unknown> 制約に違反する
  const result = toOption(ok(undefined));
  expect(result).toEqual({ some: true, value: undefined });
});

test("toOptionはnullを含むunion型のResultを型レベルで拒否する", () => {
  const result: Result<string | null, string> = ok("hello");
  // @ts-expect-error string | null は NonNullable<unknown> 制約に違反する
  const converted = toOption(result);
  expect(converted).toEqual({ some: true, value: "hello" });
});

test("toOptionはundefinedを含むunion型のResultを型レベルで拒否する", () => {
  const result: Result<number | undefined, string> = ok(1);
  // @ts-expect-error number | undefined は NonNullable<unknown> 制約に違反する
  const converted = toOption(result);
  expect(converted).toEqual({ some: true, value: 1 });
});

test("toOptionはunknown型のResultを型レベルで拒否する", () => {
  const result: Result<unknown, string> = ok(42);
  // @ts-expect-error unknown は nullish を含みうるため NonNullable<unknown> 制約に違反する
  const converted = toOption(result);
  expect(converted).toEqual({ some: true, value: 42 });
});

test("toOptionの戻り値型はOption<T>に完全一致する", () => {
  const result: Result<number, string> = ok(42);
  const converted = toOption(result);
  const returnTypeIsExactlyOption: Assert<
    IsExact<typeof converted, Option<number>>
  > = true;
  expect(returnTypeIsExactlyOption).toBe(true);
  expect(converted).toEqual({ some: true, value: 42 });
});

test("toOptionは非nullishのunion型を許容する", () => {
  const result: Result<string | number, string> = ok(7);
  const converted = toOption(result);
  expect(converted).toEqual({ some: true, value: 7 });
});

test("toResultはnullishを含むOption<T>も制約なしで受け取れる", () => {
  const option: Option<string | null> = some("hello");
  const result = toResult(option, "missing");
  expect(result).toEqual({ ok: true, value: "hello" });
});

test("toOptionはResult<never, E>を許容し戻り値型はOption<never>になる", () => {
  const result: Result<never, string> = err("error");
  const converted = toOption<never, string>(result);
  const returnTypeIsExactlyOptionNever: Assert<
    IsExact<typeof converted, Option<never>>
  > = true;
  expect(returnTypeIsExactlyOptionNever).toBe(true);
  expect(converted).toBe(none);
});
