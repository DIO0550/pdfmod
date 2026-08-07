import type { Brand } from "../../../utils/brand/index";

declare const RenderingIntentBrand: unique symbol;

/**
 * ISO 32000-1:2008 §8.6.5.8 Rendering Intents.
 * 標準的な値: "AbsoluteColorimetric", "RelativeColorimetric", "Saturation", "Perceptual"。
 * 標準外の name にも対応するため string の Brand 型として表現する。
 */
export type RenderingIntent = Brand<string, typeof RenderingIntentBrand>;

export const RenderingIntent = {
  /**
   * 文字列から RenderingIntent を生成する。
   *
   * @param name - rendering intent 名 (例: "RelativeColorimetric")
   * @returns Brand 付き RenderingIntent
   */
  create(name: string): RenderingIntent {
    return name as RenderingIntent;
  },
} as const;
