// ISO 32000-2:2020 §14.6 Marked content

import type {
  PdfDictionary,
  PdfName,
} from "../../../pdf/types/pdf-types/index";
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

/**
 * BMC / BDC / EMC operator で管理される marked content の LIFO スタック。
 * 状態の遷移は companion object が新しいスタックを返す形で行う。
 */
export type MarkedContentStack = {
  readonly current: ReadonlyArray<MarkedContentEntry>;
};

export const MarkedContentStack = {
  /**
   * 空の marked content スタックを生成する。
   *
   * @returns 要素 0 件の `MarkedContentStack`
   */
  create(): MarkedContentStack {
    return {
      current: [],
    };
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
    };
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
    const next: MarkedContentStack = {
      current: stack.current.slice(0, lastIndex),
    };
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
