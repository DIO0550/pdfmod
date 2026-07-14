import type { PdfWarning } from "../../../pdf/errors/warning/index";
import type { Brand } from "../../../utils/brand/index";
import type { GraphicsState } from "../graphics-state";
import { GraphicsState as GraphicsStateFactory } from "../graphics-state";

declare const GraphicsStateStackBrand: unique symbol;

type GraphicsStateStackFields = {
  current: GraphicsState;
  saved: GraphicsState[];
};

/**
 * PDF content stream の `q` / `Q` operator で使うグラフィックスステートスタック。
 * `current` は現在状態、`saved` は保存済み状態を LIFO 順で保持する。
 * 内部表現 `{ current: GraphicsState; saved: GraphicsState[] }` を Brand 型で包むことで
 * 素のオブジェクトリテラルが代入されることを防ぐ。
 *
 * 注: `current` / `saved` フィールドは型システム上はモジュール外からも参照可能だが、
 * 規約上 private 扱いとし、外部から直接アクセス・変更してはならない。
 * 状態変更が必要な操作は元 stack を mutate せず、新しい stack を返す。
 * 公開 API は companion object（`create` / `current` / `replaceCurrent` / `save` / `restore`）のみ。
 */
export type GraphicsStateStack = Brand<
  GraphicsStateStackFields,
  typeof GraphicsStateStackBrand
>;

/**
 * `GraphicsStateStack.restore` の返却型。
 * `stack` は復元後の新しいスタック、`warning` は unbalanced restore を
 * 検出したときに `UNBALANCED_RESTORE` を含む。それ以外は `undefined`。
 */
export interface RestoreResult {
  stack: GraphicsStateStack;
  warning?: PdfWarning;
}

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
   * @param stack - 置き換え元スタック
   * @param state - 新しい現在状態
   * @returns current 置き換え済みの新しい `GraphicsStateStack`
   */
  replaceCurrent(
    stack: GraphicsStateStack,
    state: GraphicsState,
  ): GraphicsStateStack {
    return {
      current: state,
      saved: [...stack.saved],
    } as unknown as GraphicsStateStack;
  },

  /**
   * 現在のグラフィックスステートを保存する。
   *
   * @param stack - 保存元スタック
   * @returns current を保存済み状態へ追加した新しい `GraphicsStateStack`
   */
  save(stack: GraphicsStateStack): GraphicsStateStack {
    return {
      current: stack.current,
      saved: [...stack.saved, stack.current],
    } as unknown as GraphicsStateStack;
  },

  /**
   * 直近に保存したグラフィックスステートを復元する。
   * 保存状態がない場合は no-op で新しい stack（current 維持、saved:[]）を返し、
   * `warning: UNBALANCED_RESTORE` を含む結果を返す。呼び出し元は `warning`
   * 未使用時はそのまま無視できる。
   *
   * @param stack - 復元元スタック
   * @returns 復元後の `GraphicsStateStack` と、unbalanced 検出時の警告（あれば）
   */
  restore(stack: GraphicsStateStack): RestoreResult {
    const lastIndex = stack.saved.length - 1;
    if (lastIndex < 0) {
      return {
        stack: {
          current: stack.current,
          saved: [],
        } as unknown as GraphicsStateStack,
        warning: {
          code: "UNBALANCED_RESTORE",
          message:
            "Cannot restore graphics state: no saved state on stack (unbalanced restore)",
        },
      };
    }

    const state = stack.saved[lastIndex] as GraphicsState;
    return {
      stack: {
        current: state,
        saved: stack.saved.slice(0, lastIndex),
      } as unknown as GraphicsStateStack,
    };
  },
} as const;
