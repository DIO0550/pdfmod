import type { Brand } from "../../../utils/brand/index";
import type { Option } from "../../../utils/option/index";
import { none } from "../../../utils/option/index";
import { TextRenderingMode } from "../text-rendering-mode";

declare const TextStateBrand: unique symbol;

type TextStateFields = {
  readonly charSpace: number; // Tc, default 0
  readonly wordSpace: number; // Tw, default 0
  readonly horizontalScaling: number; // Tz, default 100 (= 100%)
  readonly leading: number; // TL, default 0
  readonly fontName: Option<string>; // Tf font name, default none
  readonly fontSize: number; // Tf font size, default 0
  readonly renderingMode: TextRenderingMode; // Tr, default FILL (0)
  readonly rise: number; // Ts, default 0
};

/**
 * PDF コンテンツストリーム実行時のテキスト状態パラメータ
 * (ISO 32000-1:2008 §9.3 Table 105 / §9.3.6)。
 * 全フィールドは readonly。更新は TextState.update で新インスタンスを生成する。
 */
export type TextState = Brand<TextStateFields, typeof TextStateBrand>;

type TextStatePartial = Partial<TextStateFields>;

export const TextState = {
  /**
   * PDF 仕様 §9.3 デフォルト値で TextState を生成する。
   *   charSpace         = 0
   *   wordSpace         = 0
   *   horizontalScaling = 100
   *   leading           = 0
   *   fontName          = none
   *   fontSize          = 0
   *   renderingMode     = FILL (0)
   *   rise              = 0
   *
   * @returns デフォルト値で初期化された TextState
   */
  create(): TextState {
    return {
      charSpace: 0,
      wordSpace: 0,
      horizontalScaling: 100,
      leading: 0,
      fontName: none,
      fontSize: 0,
      renderingMode: TextRenderingMode.create(TextRenderingMode.FILL),
      rise: 0,
    } as unknown as TextState;
  },

  /**
   * partial で指定したフィールドだけを書き換えた新しい TextState を返す。
   * 元の state は変更されない。同一参照は返さない。
   *
   * @param state - 元の TextState
   * @param partial - 書き換えたいフィールドの部分集合
   * @returns 浅いマージで生成された新しい TextState
   */
  update(state: TextState, partial: TextStatePartial): TextState {
    return {
      charSpace:
        partial.charSpace !== undefined ? partial.charSpace : state.charSpace,
      wordSpace:
        partial.wordSpace !== undefined ? partial.wordSpace : state.wordSpace,
      horizontalScaling:
        partial.horizontalScaling !== undefined
          ? partial.horizontalScaling
          : state.horizontalScaling,
      leading: partial.leading !== undefined ? partial.leading : state.leading,
      fontName:
        partial.fontName !== undefined ? partial.fontName : state.fontName,
      fontSize:
        partial.fontSize !== undefined ? partial.fontSize : state.fontSize,
      renderingMode:
        partial.renderingMode !== undefined
          ? partial.renderingMode
          : state.renderingMode,
      rise: partial.rise !== undefined ? partial.rise : state.rise,
    } as unknown as TextState;
  },
} as const;
