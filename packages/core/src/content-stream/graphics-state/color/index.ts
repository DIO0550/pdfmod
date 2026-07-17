import { ColorSpace } from "../color-space";

/**
 * PDF spec §8.6 のデバイス色値。
 * DeviceGray / DeviceRGB / DeviceCMYK を discriminated union で表現する。
 * 値域 (0.0〜1.0) の検証はここでは行わない (Issue #208 仕様)。
 */
export type GrayColor = {
  readonly kind: "gray";
  readonly g: number;
};

export type RgbColor = {
  readonly kind: "rgb";
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type CmykColor = {
  readonly kind: "cmyk";
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
};

export type Color = GrayColor | RgbColor | CmykColor;

export const Color = {
  /**
   * DeviceGray 値を生成する。
   *
   * @param g - グレースケール値 (PDF 仕様では 0.0〜1.0 だがここでは検証しない)
   * @returns GrayColor
   */
  gray(g: number): GrayColor {
    return { kind: "gray", g };
  },
  /**
   * DeviceRGB 値を生成する。
   *
   * @param r - 赤チャンネル
   * @param g - 緑チャンネル
   * @param b - 青チャンネル
   * @returns RgbColor
   */
  rgb(r: number, g: number, b: number): RgbColor {
    return { kind: "rgb", r, g, b };
  },
  /**
   * DeviceCMYK 値を生成する。
   *
   * @param c - シアンチャンネル
   * @param m - マゼンタチャンネル
   * @param y - イエローチャンネル
   * @param k - キーチャンネル
   * @returns CmykColor
   */
  cmyk(c: number, m: number, y: number, k: number): CmykColor {
    return { kind: "cmyk", c, m, y, k };
  },
  /**
   * docs/specs/04_resources_graphics_state.md §4.1 のデフォルトカラー (黒)。
   *
   * @returns GrayColor { kind: "gray", g: 0 }
   */
  defaultBlack(): GrayColor {
    return { kind: "gray", g: 0 };
  },
  /**
   * Color 値に対応する ColorSpace を返す。
   *
   * @param color - Color 値
   * @returns 対応する ColorSpace
   */
  colorSpaceOf(color: Color): ColorSpace {
    switch (color.kind) {
      case "gray":
        return ColorSpace.deviceGray();
      case "rgb":
        return ColorSpace.deviceRGB();
      case "cmyk":
        return ColorSpace.deviceCMYK();
    }
  },
} as const;
