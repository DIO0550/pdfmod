import { none, type Option, some } from "../../../utils/option/index";
import type { ValueOf } from "../../../utils/types/utility-type";

/** PDF §11.3.5 の標準ブレンドモード。 */
export const BlendModes = {
  Normal: "Normal",
  Multiply: "Multiply",
  Screen: "Screen",
  Overlay: "Overlay",
  Darken: "Darken",
  Lighten: "Lighten",
  ColorDodge: "ColorDodge",
  ColorBurn: "ColorBurn",
  HardLight: "HardLight",
  SoftLight: "SoftLight",
  Difference: "Difference",
  Exclusion: "Exclusion",
  Hue: "Hue",
  Saturation: "Saturation",
  Color: "Color",
  Luminosity: "Luminosity",
} as const;

export type BlendMode = ValueOf<typeof BlendModes>;

export const BlendMode = {
  /**
   * PDF の名前を標準ブレンドモードとして読む。
   * @param name - スラッシュを除いた名前
   * @returns 未知の名前は None。Compatible は Normal
   */
  fromName(name: string): Option<BlendMode> {
    if (name === "Compatible") {
      return some(BlendModes.Normal);
    }

    const mode = Object.values(BlendModes).find((value) => value === name);
    return mode === undefined ? none : some(mode);
  },
} as const;
