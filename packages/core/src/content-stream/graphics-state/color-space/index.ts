import type { Brand } from "../../../utils/brand/index";

declare const ColorSpaceBrand: unique symbol;

/**
 * PDF 仕様 §8.6 のデバイス色空間。
 * - DeviceGray  : グレースケール (1 チャンネル)
 * - DeviceRGB   : RGB (3 チャンネル)
 * - DeviceCMYK  : CMYK (4 チャンネル)
 *
 * Brand の基底型を文字列リテラル union に絞り、categorical domain を型レベルで保持する。
 * 基底 union は外部に export せず、Brand 越しの `ColorSpace` のみを公開する。
 */
export type ColorSpace = Brand<
  "DeviceGray" | "DeviceRGB" | "DeviceCMYK",
  typeof ColorSpaceBrand
>;

export const ColorSpace = {
  /**
   * DeviceGray 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceGray(): ColorSpace {
    return "DeviceGray" as ColorSpace;
  },

  /**
   * DeviceRGB 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceRGB(): ColorSpace {
    return "DeviceRGB" as ColorSpace;
  },

  /**
   * DeviceCMYK 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceCMYK(): ColorSpace {
    return "DeviceCMYK" as ColorSpace;
  },
} as const;
