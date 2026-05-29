import type { Brand } from "../../../utils/brand/index";
import { Matrix } from "../matrix";

declare const TextObjectBrand: unique symbol;

type TextObjectFields = {
  readonly active: boolean;
  readonly textMatrix: Matrix;
  readonly textLineMatrix: Matrix;
};

/**
 * PDF コンテンツストリームの `BT` 〜 `ET` で囲まれるテキストオブジェクト状態
 * (ISO 32000-1:2008 §9.4.1)。
 *
 * - `active` : `BT` 〜 `ET` の間で `true`、それ以外で `false`。
 * - `textMatrix`     : 現在のテキスト行列 (ISO 32000-1:2008 §9.4.2)。
 * - `textLineMatrix` : 現在のテキスト行の行列 (同 §9.4.2)。
 *
 * Phase 4-E の `Td` / `TD` / `Tm` / `T*` で matrix を更新する基盤となる。
 */
export type TextObject = Brand<TextObjectFields, typeof TextObjectBrand>;

export const TextObject = {
  /**
   * 非アクティブな TextObject を返す。`BT` 未到達時の初期状態に相当する。
   * `active = false`、`textMatrix` / `textLineMatrix` は `Matrix.identity()`。
   *
   * @returns 非アクティブな TextObject
   */
  inactive(): TextObject {
    return {
      active: false,
      textMatrix: Matrix.identity(),
      textLineMatrix: Matrix.identity(),
    } as unknown as TextObject;
  },
  /**
   * `BT` operator (ISO 32000-1:2008 §9.4.1) でテキストオブジェクトを開始する。
   * `active = true` に切り替え、`textMatrix` / `textLineMatrix` を identity に初期化する。
   *
   * @returns アクティブな TextObject
   */
  begin(): TextObject {
    return {
      active: true,
      textMatrix: Matrix.identity(),
      textLineMatrix: Matrix.identity(),
    } as unknown as TextObject;
  },
  /**
   * `ET` operator (ISO 32000-1:2008 §9.4.1) でテキストオブジェクトを終了する。
   * `active = false` に戻し、両 matrix を identity に戻す。
   * 既に inactive な state に対しても冪等 (同値の inactive を返す)。
   *
   * 現在は state を参照せず `inactive()` に委譲する。Phase 4-E で matrix
   * 更新ロジックが入った際のシグネチャを保つために state を受け取る形にしてある。
   *
   * @param _state - 終了対象の TextObject (現在は読まない)
   * @returns 非アクティブな TextObject (`inactive()` と同値)
   */
  end(_state: TextObject): TextObject {
    return TextObject.inactive();
  },
  /**
   * `state.active` を読み出す predicate (アクセサ)。
   * 戻り値は `boolean` で、TypeScript の型ナローイングは行わない
   * (`active`/`inactive` の判別可能 union 型は未定義のため)。
   *
   * @param state - 判定対象の TextObject
   * @returns `state.active` が `true` なら `true`
   */
  isActive(state: TextObject): boolean {
    return state.active;
  },
} as const;
