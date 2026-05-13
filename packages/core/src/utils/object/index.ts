/**
 * オブジェクトから値が `undefined` のキーを取り除いた新しいオブジェクトを返す。
 *
 * 入力は `T` の全キーを必須に持ち、各値は `T[K] | undefined`。
 * 戻り値は `T` 型で、入力時に `undefined` だったキーは含まない（`"key" in result` は `false`）。
 *
 * `null` / `0` / `""` / `false` は値として保持される。除外されるのは `undefined` のみ。
 *
 * @typeParam T - 結果オブジェクトの型。optional プロパティを持つことを想定する。
 * @param obj - 全キーを必須に持つオブジェクト。各値は対応する型または `undefined`。
 * @returns `undefined` 値のキーを除いたオブジェクト。
 */
export const stripUndefined = <T extends object>(
  obj: { [K in keyof T]: T[K] | undefined },
): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
