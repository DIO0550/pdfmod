import type { PdfArray, PdfStream } from "../../../pdf/types/index";
import type { Brand } from "../../../utils/brand/index";
import { none, type Option, some } from "../../../utils/option/index";
import type { ValueOf } from "../../../utils/types/utility-type";

const DeviceComponentCounts = { Gray: 1, RGB: 3, CMYK: 4 } as const;
type IccComponentCount = ValueOf<typeof DeviceComponentCounts>;

declare const ColorSpaceBrand: unique symbol;

/**
 * PDF §8.6 のデバイス色空間。既存APIとの互換性のため名前の表現を保持する。
 */
type DeviceColorSpace = Brand<
  "DeviceGray" | "DeviceRGB" | "DeviceCMYK",
  typeof ColorSpaceBrand
>;

/** ISO 32000 §8.6 の色空間。未知・不正な定義は成分数を確定しない。 */
export type ColorSpace =
  | DeviceColorSpace
  | {
      readonly family: "CalGray" | "CalRGB" | "Lab" | "Separation";
      readonly definition: PdfArray;
    }
  | {
      readonly family: "ICCBased";
      readonly profile: PdfStream;
      readonly components: IccComponentCount;
    }
  | {
      readonly family: "Indexed";
      readonly base: ColorSpace;
      readonly definition: PdfArray;
    }
  | {
      readonly family: "DeviceN";
      readonly names: readonly string[];
      readonly definition: PdfArray;
    }
  | { readonly family: "Pattern"; readonly base: Option<ColorSpace> }
  | { readonly family: "Unknown"; readonly name: string };

export const ColorSpace = {
  /**
   * ICCプロファイルで有効な成分数に絞る。
   * @param count - プロファイル辞書の /N
   * @returns 1・3・4なら成分数、それ以外は None
   */
  iccComponentCount(count: number): Option<IccComponentCount> {
    const valid =
      count === DeviceComponentCounts.Gray ||
      count === DeviceComponentCounts.RGB ||
      count === DeviceComponentCounts.CMYK;
    return valid ? some(count) : none;
  },
  /**
   * DeviceGray 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceGray(): DeviceColorSpace {
    return "DeviceGray" as DeviceColorSpace;
  },

  /**
   * DeviceRGB 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceRGB(): DeviceColorSpace {
    return "DeviceRGB" as DeviceColorSpace;
  },

  /**
   * DeviceCMYK 色空間を返す。
   * @returns Brand 付き ColorSpace 値
   */
  deviceCMYK(): DeviceColorSpace {
    return "DeviceCMYK" as DeviceColorSpace;
  },

  /**
   * 単独名で指定できる色空間を読む。
   * @param name - スラッシュを除いたPDF名
   * @returns デバイス色空間またはPattern。それ以外は None
   */
  fromName(name: string): Option<ColorSpace> {
    switch (name) {
      case "DeviceGray":
        return some(ColorSpace.deviceGray());
      case "DeviceRGB":
        return some(ColorSpace.deviceRGB());
      case "DeviceCMYK":
        return some(ColorSpace.deviceCMYK());
      case "Pattern":
        return some({ family: "Pattern", base: none });
      default:
        return none;
    }
  },

  /**
   * 色オペランドの数値成分数を求める。Pattern名はこの数に含めない。
   * @param space - 現在の色空間
   * @returns 未知の定義や未知のPattern基底は None
   */
  componentCount(space: ColorSpace): Option<number> {
    if (typeof space === "string") {
      switch (space) {
        case "DeviceGray":
          return some(DeviceComponentCounts.Gray);
        case "DeviceRGB":
          return some(DeviceComponentCounts.RGB);
        case "DeviceCMYK":
          return some(DeviceComponentCounts.CMYK);
      }
    }

    switch (space.family) {
      case "CalGray":
      case "Separation":
      case "Indexed":
        return some(1);
      case "CalRGB":
      case "Lab":
        return some(DeviceComponentCounts.RGB);
      case "ICCBased":
        return some(space.components);
      case "DeviceN":
        return some(space.names.length);
      case "Pattern":
        return space.base.some
          ? ColorSpace.componentCount(space.base.value)
          : some(0);
      case "Unknown":
        return none;
    }
  },
} as const;
