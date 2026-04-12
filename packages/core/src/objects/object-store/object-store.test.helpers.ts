import { expect } from "vitest";
import type { Result } from "../../result/index";
import { GenerationNumber } from "../../types/generation-number/index";
import { ObjectNumber } from "../../types/object-number/index";
import type {
  IndirectRef,
  XRefEntry,
  XRefTable,
} from "../../types/pdf-types/index";
import type { ObjectStoreSource } from "./types";

/**
 * Result が ok であることをアサートし value を返す。
 *
 * @param result - unwrap 対象の Result
 * @returns ok の場合の value
 */
export const unwrapOk = <T>(result: Result<T, unknown>): T => {
  expect(result.ok).toBe(true);
  return (result as { value: T }).value;
};

/**
 * Result が err であることをアサートし error を返す。
 *
 * @param result - unwrap 対象の Result
 * @returns err の場合の error
 */
export const unwrapErr = <E>(result: Result<unknown, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { error: E }).error;
};

/**
 * テスト用の IndirectRef を生成する。
 *
 * @param objNum - オブジェクト番号
 * @param genNum - 世代番号（デフォルト 0）
 * @returns IndirectRef
 */
export const makeRef = (objNum: number, genNum: number = 0): IndirectRef => ({
  objectNumber: ObjectNumber.of(objNum),
  generationNumber: GenerationNumber.of(genNum),
});

/**
 * テスト用の XRefTable を生成する。
 *
 * @param entries - エントリ配列
 * @returns XRefTable
 */
export const makeXRefTable = (
  entries: ReadonlyArray<readonly [number, XRefEntry]>,
): XRefTable => {
  const map = new Map<ObjectNumber, XRefEntry>();
  for (const [num, entry] of entries) {
    map.set(ObjectNumber.of(num), entry);
  }
  const maxNum = entries.length > 0 ? Math.max(...entries.map(([n]) => n)) : 0;
  return { entries: map, size: maxNum + 1 };
};

/**
 * テスト用の ObjectStoreSource を生成する。
 *
 * @param overrides - 上書きするプロパティ
 * @returns ObjectStoreSource
 */
export const makeStoreSource = (
  overrides: Partial<ObjectStoreSource> = {},
): ObjectStoreSource => ({
  xref: overrides.xref ?? makeXRefTable([]),
  data: overrides.data ?? new Uint8Array(0),
});
