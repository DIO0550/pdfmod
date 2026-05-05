import type { Brand } from "../../utils/brand/index";
import { LineCap } from "./line-cap";
import { LineJoin } from "./line-join";
import { Matrix } from "./matrix";

export { LineCap } from "./line-cap";
export { LineJoin } from "./line-join";
export { Matrix } from "./matrix";

declare const GraphicsStateBrand: unique symbol;

/**
 * PDF コンテンツストリーム実行時の現在のグラフィックスステート (最小サブセット)。
 * 全フィールドは readonly。更新は GraphicsState.update で新インスタンスを生成する。
 */
export type GraphicsState = Brand<
  {
    readonly ctm: Matrix;
    readonly lineWidth: number;
    readonly lineCap: LineCap;
    readonly lineJoin: LineJoin;
    readonly miterLimit: number;
  },
  typeof GraphicsStateBrand
>;

type GraphicsStatePartial = Partial<{
  ctm: Matrix;
  lineWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
}>;

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
      ctm: Matrix.identity(),
      lineWidth: 1.0,
      lineCap: LineCap.create(0),
      lineJoin: LineJoin.create(0),
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
    return { ...state, ...partial } as unknown as GraphicsState;
  },
} as const;
