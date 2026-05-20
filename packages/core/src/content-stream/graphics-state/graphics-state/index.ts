import type { Brand } from "../../../utils/brand/index";
import { Color } from "../color";
import { ColorSpace } from "../color-space";
import { CurrentPath } from "../current-path";
import { LineCap } from "../line-cap";
import { LineJoin } from "../line-join";
import { Matrix } from "../matrix";

declare const GraphicsStateBrand: unique symbol;

type GraphicsStateFields = {
  readonly ctm: Matrix;
  readonly lineWidth: number;
  readonly lineCap: LineCap;
  readonly lineJoin: LineJoin;
  readonly miterLimit: number;
  readonly currentPath: CurrentPath;
  readonly strokeColor: Color;
  readonly fillColor: Color;
  readonly strokeColorSpace: ColorSpace;
  readonly fillColorSpace: ColorSpace;
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
   *   ctm              = identity
   *   lineWidth        = 1.0
   *   lineCap          = 0 (Butt)
   *   lineJoin         = 0 (Miter)
   *   miterLimit       = 10.0
   *   currentPath      = empty()
   *   strokeColor      = defaultBlack (DeviceGray gray=0)
   *   fillColor        = defaultBlack (DeviceGray gray=0)
   *   strokeColorSpace = DeviceGray
   *   fillColorSpace   = DeviceGray
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
      currentPath: CurrentPath.empty(),
      strokeColor: Color.defaultBlack(),
      fillColor: Color.defaultBlack(),
      strokeColorSpace: ColorSpace.deviceGray(),
      fillColorSpace: ColorSpace.deviceGray(),
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
      currentPath:
        partial.currentPath !== undefined
          ? partial.currentPath
          : state.currentPath,
      strokeColor:
        partial.strokeColor !== undefined
          ? partial.strokeColor
          : state.strokeColor,
      fillColor:
        partial.fillColor !== undefined ? partial.fillColor : state.fillColor,
      strokeColorSpace:
        partial.strokeColorSpace !== undefined
          ? partial.strokeColorSpace
          : state.strokeColorSpace,
      fillColorSpace:
        partial.fillColorSpace !== undefined
          ? partial.fillColorSpace
          : state.fillColorSpace,
    } as unknown as GraphicsState;
  },
} as const;
