/**
 * オブジェクト型のすべての value 型を union として取り出すユーティリティ型。
 * `as const` で定義した定数オブジェクトから categorical な literal union を
 * 導出する用途で使う (`(typeof Obj)[keyof typeof Obj]` の省略形)。
 *
 * @typeParam T - object 型
 *
 * @example
 * ```ts
 * const Mode = { A: 0, B: 1 } as const;
 * type ModeValue = ValueOf<typeof Mode>; // 0 | 1
 * ```
 */
export type ValueOf<T> = T[keyof T];
