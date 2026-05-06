import type { PdfError } from "../../pdf/errors/index";
import type { Brand } from "../../utils/brand/index";
import type { Option } from "../../utils/option/index";
import { none } from "../../utils/option/index";
import type { GraphicsState } from "./index";
import { GraphicsState as GraphicsStateFactory } from "./index";

declare const GraphicsStateStackBrand: unique symbol;

type GraphicsStateStackFields = {
  current: GraphicsState;
  saved: GraphicsState[];
};

/**
 * PDF content stream の `q` / `Q` operator で使うグラフィックスステートスタック。
 * `current` は現在状態、`saved` は保存済み状態を LIFO 順で保持する。
 */
export type GraphicsStateStack = Brand<
  GraphicsStateStackFields,
  typeof GraphicsStateStackBrand
>;

export const GraphicsStateStack = {
  /**
   * デフォルトグラフィックスステートを current に持つスタックを生成する。
   *
   * @returns 初期状態の `GraphicsStateStack`
   */
  create(): GraphicsStateStack {
    return {
      current: GraphicsStateFactory.create(),
      saved: [] as GraphicsState[],
    } as unknown as GraphicsStateStack;
  },

  /**
   * 現在のグラフィックスステートを返す。
   *
   * @param stack - 対象スタック
   * @returns 現在の `GraphicsState`
   */
  current(stack: GraphicsStateStack): GraphicsState {
    return stack.current;
  },

  /**
   * 現在のグラフィックスステートを置き換える。
   *
   * @param stack - 対象スタック（mutate される）
   * @param state - 新しい現在状態
   */
  replaceCurrent(stack: GraphicsStateStack, state: GraphicsState): void {
    stack.current = state;
  },

  /**
   * 現在のグラフィックスステートを保存する。
   *
   * @param stack - 対象スタック（mutate される）
   * @returns 常に `none`
   */
  save(stack: GraphicsStateStack): Option<PdfError> {
    stack.saved.push(stack.current);
    return none;
  },

  /**
   * 直近に保存したグラフィックスステートを復元する。
   * 保存状態がない場合は PDF 仕様メモの実装例に合わせて no-op とする。
   *
   * @param stack - 対象スタック（mutate される）
   * @returns 常に `none`
   */
  restore(stack: GraphicsStateStack): Option<PdfError> {
    const lastIndex = stack.saved.length - 1;
    if (lastIndex < 0) {
      return none;
    }

    const state = stack.saved[lastIndex] as GraphicsState;
    stack.saved.length = lastIndex;
    stack.current = state;
    return none;
  },
} as const;
