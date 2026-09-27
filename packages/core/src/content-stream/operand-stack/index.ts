import type { PdfObject } from "../../pdf/types/pdf-types/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";

/**
 * PDF コンテンツストリーム (RPN) のオペランドスタック。
 * interpreter が1回の走査のあいだ使い回す可変スタックで、`items` の書き換えは
 * companion object の `push` / `pop` / `clear` だけが行う。
 */
export type OperandStack = {
  readonly items: PdfObject[];
};

/**
 * `OperandStack` の factory / 操作群を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const OperandStack = {
  /**
   * 空のスタックを生成する。
   *
   * @returns 要素 0 件の `OperandStack`
   */
  create(): OperandStack {
    return { items: [] };
  },

  /**
   * スタック先頭に値を積む（in-place、O(1) 償却）。
   *
   * @param stack - 対象スタック（mutate される）
   * @param value - 積む値
   */
  push(stack: OperandStack, value: PdfObject): void {
    stack.items.push(value);
  },

  /**
   * スタック先頭から値を取り出す（in-place、O(1)）。
   *
   * @param stack - 対象スタック（mutate される）
   * @returns 空なら `none`、それ以外は `some(value)`
   */
  pop(stack: OperandStack): Option<PdfObject> {
    const length = stack.items.length;
    if (length === 0) {
      return none;
    }
    const lastIndex = length - 1;
    const value = stack.items[lastIndex] as PdfObject;
    stack.items.length = lastIndex;
    return some(value);
  },

  /**
   * スタック先頭の値を取り出さずに参照する。
   *
   * @param stack - 対象スタック
   * @returns 空なら `none`、それ以外は `some(top)`
   */
  peek(stack: OperandStack): Option<PdfObject> {
    const length = stack.items.length;
    if (length === 0) {
      return none;
    }
    return some(stack.items[length - 1] as PdfObject);
  },

  /**
   * 現在の要素数を返す。
   *
   * @param stack - 対象スタック
   * @returns 要素数（空なら 0）
   */
  depth(stack: OperandStack): number {
    return stack.items.length;
  },

  /**
   * スタックを空にする（in-place）。
   *
   * @param stack - 対象スタック（mutate される）
   */
  clear(stack: OperandStack): void {
    stack.items.length = 0;
  },
} as const;
