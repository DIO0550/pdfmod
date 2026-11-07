import { none, type Option } from "../../../utils/option/index";
import { ColorSpace } from "../color-space";

/**
 * DeviceGray の色値。
 */
export type GrayColor = {
  readonly kind: "gray";
  readonly g: number;
};

/**
 * DeviceRGB の色値。
 */
export type RgbColor = {
  readonly kind: "rgb";
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/**
 * DeviceCMYK の色値。
 */
export type CmykColor = {
  readonly kind: "cmyk";
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
};

/**
 * PDF §8.6 の色値。デバイス色は各チャンネル、それ以外は色空間と数値成分を保持する。
 * 値域のクリップや他の色空間への変換は行わない。
 */
export type Color =
  | GrayColor
  | RgbColor
  | CmykColor
  | {
      readonly kind: "components";
      readonly colorSpace: ColorSpace;
      readonly components: readonly number[];
      readonly pattern: Option<string>;
    };

export const Color = {
  /**
   * 色空間選択時の初期色を作る（ISO 32000 §8.6）。
   * @param space - 選択する色空間
   * @returns デバイス色は黒、特色は全成分1、その他は全成分0
   */
  initial(space: ColorSpace): Color {
    if (space === ColorSpace.deviceCMYK()) {
      return Color.cmyk(0, 0, 0, 1);
    }

    const count = ColorSpace.componentCount(space);
    const tint =
      typeof space !== "string" &&
      (space.family === "Separation" || space.family === "DeviceN");
    return Color.fromComponents(
      space,
      Array.from({ length: count.some ? count.value : 0 }, () =>
        tint ? 1 : 0,
      ),
    );
  },
  /**
   * 選択した色空間の成分を保持する。デバイス色は既存の表現へ変換する。
   * @param space - 選択した色空間
   * @param components - 記述順の数値成分
   * @param pattern - scn / SCN のパターン名
   * @returns 色空間に対応する色値
   */
  fromComponents(
    space: ColorSpace,
    components: readonly number[],
    pattern: Option<string> = none,
  ): Color {
    const [first, second, third, fourth] = components;
    if (typeof space === "string") {
      switch (space) {
        case "DeviceGray":
          return Color.gray(first);
        case "DeviceRGB":
          return Color.rgb(first, second, third);
        case "DeviceCMYK":
          return Color.cmyk(first, second, third, fourth);
      }
    }

    return {
      kind: "components",
      colorSpace: space,
      components: [...components],
      pattern,
    };
  },
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
      case "components":
        return color.colorSpace;
    }
  },
} as const;
