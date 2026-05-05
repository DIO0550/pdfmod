import type { PdfObject } from "../../pdf/types/pdf-types/index";
import type { Brand } from "../../utils/brand/index";
import type { Option } from "../../utils/option/index";
import { none, some } from "../../utils/option/index";

/** OperandStack の内部表現を区別するためのブランドタグ。 */
declare const OperandStackBrand: unique symbol;

/**
 * PDF コンテンツストリーム (RPN) のオペランドスタック型。
 * 内部表現 `{ items: PdfObject[] }` を Brand 型で包むことで
 * 素のオブジェクトリテラルが代入されることを防ぐ。
 *
 * 注: `items` フィールドは型システム上はモジュール外からも参照可能だが、
 * 規約上 private 扱いとし、外部から `stack.items` に直接アクセス・変更してはならない。
 * 公開 API は companion object（`create` / `push` / `pop` / `peek` / `depth` / `clear`）のみ。
 */
type OperandStack = Brand<{ items: PdfObject[] }, typeof OperandStackBrand>;

/**
 * `OperandStack` の factory / 操作群を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
const OperandStack = {
  /**
   * 空のスタックを生成する。
   *
   * @returns 要素 0 件の `OperandStack`
   */
  create(): OperandStack {
    return { items: [] as PdfObject[] } as unknown as OperandStack;
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

export { OperandStack };
