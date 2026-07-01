// ISO 32000-2:2020 §14.6 Marked content

import type {
  PdfDictionary,
  PdfName,
} from "../../../pdf/types/pdf-types/index";
import type { Brand } from "../../../utils/brand/index";
import type { Option } from "../../../utils/option/index";
import { none, some } from "../../../utils/option/index";

/**
 * Marked content stack の各エントリ。
 * BMC operator 由来は `properties: none`、BDC operator 由来は dict もしくは name reference を保持する。
 */
export type MarkedContentEntry = {
  readonly tag: PdfName;
  readonly properties: Option<PdfDictionary | PdfName>;
};

declare const MarkedContentStackBrand: unique symbol;

type MarkedContentStackFields = {
  readonly current: ReadonlyArray<MarkedContentEntry>;
};

/**
 * BMC / BDC / EMC operator で管理される marked content の LIFO スタック。
 * 内部表現 `{ current: ReadonlyArray<MarkedContentEntry> }` を Brand 型で包み、
 * 素のオブジェクトリテラルが代入されることを防ぐ。
 *
 * 注: `current` フィールドは型システム上はモジュール外からも参照可能だが、
 * 規約上 private 扱いとし、外部から直接アクセス・変更してはならない。
 * 状態変更が必要な操作は元 stack を mutate せず、新しい stack を返す。
 */
export type MarkedContentStack = Brand<
  MarkedContentStackFields,
  typeof MarkedContentStackBrand
>;

export const MarkedContentStack = {
  /**
   * 空の marked content スタックを生成する。
   *
   * @returns 要素 0 件の `MarkedContentStack`
   */
  create(): MarkedContentStack {
    return {
      current: [] as ReadonlyArray<MarkedContentEntry>,
    } as unknown as MarkedContentStack;
  },

  /**
   * `entry` を末尾に積んだ新しい stack を返す。
   * 元 `stack` は変更されず、内部 `current` 配列も新規生成する
   * (`[...stack.current, entry]` で別配列参照)。
   *
   * @param stack - 元のスタック（変更されない）
   * @param entry - 積む {@link MarkedContentEntry}
   * @returns entry を追加した新規 `MarkedContentStack`
   */
  push(
    stack: MarkedContentStack,
    entry: MarkedContentEntry,
  ): MarkedContentStack {
    return {
      current: [...stack.current, entry],
    } as unknown as MarkedContentStack;
  },

  /**
   * 末尾の entry を取り出した新しい stack と取り出した entry を返す。
   * 元 `stack` は変更されず、`slice(0, lastIndex)` で新規配列を生成する。
   *
   * @param stack - 対象スタック（変更されない）
   * @returns 空なら `none`、それ以外は `some({ stack, popped })`
   */
  pop(
    stack: MarkedContentStack,
  ): Option<{ stack: MarkedContentStack; popped: MarkedContentEntry }> {
    const length = stack.current.length;
    if (length === 0) {
      return none;
    }
    const lastIndex = length - 1;
    const popped = stack.current[lastIndex] as MarkedContentEntry;
    const next = {
      current: stack.current.slice(0, lastIndex),
    } as unknown as MarkedContentStack;
    return some({ stack: next, popped });
  },

  /**
   * 現在の深さ（積まれている entry 数）を返す。
   *
   * @param stack - 対象スタック
   * @returns 深さ（空なら 0）
   */
  depth(stack: MarkedContentStack): number {
    return stack.current.length;
  },
} as const;
