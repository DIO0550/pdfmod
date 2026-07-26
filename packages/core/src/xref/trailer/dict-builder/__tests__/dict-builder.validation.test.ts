// 担当範囲: 必須フィールド /Root・/Size の異常系（ROOT_NOT_FOUND / SIZE_NOT_FOUND）。
// オプションフィールドの異常系は error、境界値は boundary を参照。

import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../../pdf/types/byte-offset/index";
import type { PdfValue } from "../../../../pdf/types/index";
import { trailerDictBuilder } from "../index";

const validRoot: PdfValue = {
  type: "indirect-ref",
  objectNumber: 1,
  generationNumber: 0,
};
const validSize: PdfValue = { type: "integer", value: 10 };

const ROOT_OFFSET = ByteOffset.of(42);
const SIZE_OFFSET = ByteOffset.of(77);

test("/Root 未設定の場合に ROOT_NOT_FOUND を offset なしで返す", () => {
  // 異常系: !_root 分岐。この err だけ offset フィールドを持たない非対称を固定する
  const result = trailerDictBuilder().size(validSize).build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBeUndefined();
});

test("/Root が indirect-ref 以外（integer）の場合に ROOT_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Root 5` のように直接値が書かれた不正 PDF
  const result = trailerDictBuilder()
    .root({ type: "integer", value: 5 }, ROOT_OFFSET)
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ROOT_OFFSET);
});

test("/Root の objectNumber が -1 の場合に ROOT_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Root -1 0 R` 相当の不正参照
  const result = trailerDictBuilder()
    .root(
      { type: "indirect-ref", objectNumber: -1, generationNumber: 0 },
      ROOT_OFFSET,
    )
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ROOT_OFFSET);
});

test("/Root の objectNumber が NaN の場合に ROOT_NOT_FOUND と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(
      { type: "indirect-ref", objectNumber: NaN, generationNumber: 0 },
      ROOT_OFFSET,
    )
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ROOT_OFFSET);
});

test.each([
  -1,
  1.5,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("/Root の generationNumber が %s の場合に ROOT_NOT_FOUND と offset を返す", (invalid) => {
  // 異常系: 既存の間接テストが踏んでいない不正 generation 値。
  // どの不正値でも ROOT_NOT_FOUND を返すという契約の固定が目的であり、
  // isSafeIntegerAtLeastZero ガードと GenerationNumber.create の
  // どちらで落ちたかは同一 code + offset のため区別しない
  const result = trailerDictBuilder()
    .root(
      { type: "indirect-ref", objectNumber: 1, generationNumber: invalid },
      ROOT_OFFSET,
    )
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ROOT_OFFSET);
});

test("/Root の generationNumber が NaN の場合に ROOT_NOT_FOUND と offset を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = trailerDictBuilder()
    .root(
      { type: "indirect-ref", objectNumber: 1, generationNumber: NaN },
      ROOT_OFFSET,
    )
    .size(validSize)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("ROOT_NOT_FOUND");
  expect(result.error.offset).toBe(ROOT_OFFSET);
});

test("/Size 未設定の場合に SIZE_NOT_FOUND を offset なしで返す", () => {
  // 異常系: !_size 分岐。この err だけ offset フィールドを持たない非対称を固定する
  const result = trailerDictBuilder().root(validRoot).build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBeUndefined();
});

test("/Size が real 型で値が非負 safe integer（10）の場合に SIZE_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Size 10.0` 相当。短絡評価の第 1 項 `_size.type !== "integer"` を
  // 単独で踏める唯一の入力（第 2 項は値 10 を通してしまう）
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "real", value: 10 }, SIZE_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(SIZE_OFFSET);
});

test("/Size が real 型で値も非整数（1.5）の場合に SIZE_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Size 1.5`。parser.error.test.ts が間接カバー済みだが
  // Builder 単体で再固定する。短絡評価の第 1 項・第 2 項の両方に該当する
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "real", value: 1.5 }, SIZE_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(SIZE_OFFSET);
});

test("/Size が name 型の場合に SIZE_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Size /Foo` のような型不一致
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "name", value: "Foo" }, SIZE_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(SIZE_OFFSET);
});

test("/Size が integer で -1 の場合に SIZE_NOT_FOUND と offset を返す", () => {
  // 異常系: `/Size -1`。短絡評価の第 2 項（isSafeIntegerAtLeastZero）側
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: -1 }, SIZE_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(SIZE_OFFSET);
});

test("/Size が integer だが NaN の場合に SIZE_NOT_FOUND と offset を返す", () => {
  // 異常系: 型は integer だが値が非 safe integer。短絡評価の第 2 項を独立に踏む
  const result = trailerDictBuilder()
    .root(validRoot)
    .size({ type: "integer", value: NaN }, SIZE_OFFSET)
    .build();

  assert(!result.ok);
  expect(result.error.code).toBe("SIZE_NOT_FOUND");
  expect(result.error.offset).toBe(SIZE_OFFSET);
});
