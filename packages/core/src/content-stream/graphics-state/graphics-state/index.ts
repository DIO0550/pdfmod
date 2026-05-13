import type { Brand } from "../../../utils/brand/index";
import type { LineCap } from "../line-cap";
import { LineCap as LineCapFactory } from "../line-cap";
import type { LineJoin } from "../line-join";
import { LineJoin as LineJoinFactory } from "../line-join";
import type { Matrix } from "../matrix";
import { Matrix as MatrixFactory } from "../matrix";

declare const GraphicsStateBrand: unique symbol;

type GraphicsStateFields = {
  readonly ctm: Matrix;
  readonly lineWidth: number;
  readonly lineCap: LineCap;
  readonly lineJoin: LineJoin;
  readonly miterLimit: number;
};

/**
 * PDF コンテンツストリーム実行時の現在のグラフィックスステート (最小サブセット)。
 * 全フィールドは readonly。更新は GraphicsState.update で新インスタンスを生成する。
 */
export type GraphicsState = Brand<
  GraphicsStateFields,
  typeof GraphicsStateBrand
>;

type GraphicsStatePartial = Partial<GraphicsStateFields>;

export const GraphicsState = {
  /**
   * PDF 仕様 §4.1 デフォルト値で GraphicsState を生成する。
   *   ctm        = identity
   *   lineWidth  = 1.0
   *   lineCap    = 0 (Butt)
   *   lineJoin   = 0 (Miter)
   *   miterLimit = 10.0
   *
   * @returns デフォルト値で初期化された GraphicsState
   */
  create(): GraphicsState {
    return {
      ctm: MatrixFactory.identity(),
      lineWidth: 1.0,
      lineCap: LineCapFactory.create(0),
      lineJoin: LineJoinFactory.create(0),
      miterLimit: 10.0,
    } as unknown as GraphicsState;
  },

  /**
   * partial で指定したフィールドだけを書き換えた新しい GraphicsState を返す。
   * 元の state は変更されない。同一参照は返さない。
   *
   * @param state - 元の GraphicsState
   * @param partial - 書き換えたいフィールドの部分集合
   * @returns 浅いマージで生成された新しい GraphicsState
   */
  update(state: GraphicsState, partial: GraphicsStatePartial): GraphicsState {
    return {
      ctm: partial.ctm !== undefined ? partial.ctm : state.ctm,
      lineWidth:
        partial.lineWidth !== undefined ? partial.lineWidth : state.lineWidth,
      lineCap: partial.lineCap !== undefined ? partial.lineCap : state.lineCap,
      lineJoin:
        partial.lineJoin !== undefined ? partial.lineJoin : state.lineJoin,
      miterLimit:
        partial.miterLimit !== undefined
          ? partial.miterLimit
          : state.miterLimit,
    } as unknown as GraphicsState;
  },
} as const;
