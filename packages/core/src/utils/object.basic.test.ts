import { expect, test } from "vitest";
import { stripUndefined } from "./object";

interface SampleMetadata {
  readonly title?: string;
  readonly count?: number;
  readonly active?: boolean;
}

test("全キーが値ありの場合はすべてのキーが残る", () => {
  const result = stripUndefined<SampleMetadata>({
    title: "hello",
    count: 1,
    active: true,
  });
  expect(result).toEqual({ title: "hello", count: 1, active: true });
});

test("undefined のキーは結果から除外される", () => {
  const result = stripUndefined<SampleMetadata>({
    title: "hello",
    count: undefined,
    active: true,
  });
  expect(result).toEqual({ title: "hello", active: true });
  expect("count" in result).toBe(false);
});

test("全キーが undefined の場合は空オブジェクトを返す", () => {
  const result = stripUndefined<SampleMetadata>({
    title: undefined,
    count: undefined,
    active: undefined,
  });
  expect(result).toEqual({});
  expect(Object.keys(result)).toHaveLength(0);
});

interface FalsyContainer {
  readonly nullValue?: null;
  readonly zero?: number;
  readonly emptyString?: string;
  readonly falseValue?: boolean;
}

test.each<[keyof FalsyContainer, FalsyContainer[keyof FalsyContainer]]>([
  ["nullValue", null],
  ["zero", 0],
  ["emptyString", ""],
  ["falseValue", false],
])("falsy 値 (%s = %j) は undefined ではないので保持される", (key, value) => {
  const input: { [K in keyof FalsyContainer]: FalsyContainer[K] | undefined } =
    {
      nullValue: undefined,
      zero: undefined,
      emptyString: undefined,
      falseValue: undefined,
      [key]: value,
    };
  const result = stripUndefined<FalsyContainer>(input);
  expect(key in result).toBe(true);
  expect(result[key]).toBe(value);
});

test("入力オブジェクトを破壊的に変更しない", () => {
  const input: { title: string | undefined; count: number | undefined } = {
    title: "hello",
    count: undefined,
  };
  stripUndefined<{ title?: string; count?: number }>(input);
  expect(input).toEqual({ title: "hello", count: undefined });
  expect("count" in input).toBe(true);
});
