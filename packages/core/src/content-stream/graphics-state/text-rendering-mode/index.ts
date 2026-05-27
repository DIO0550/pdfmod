import type { Brand } from "../../../utils/brand/index";

declare const TextRenderingModeBrand: unique symbol;

/**
 * PDF §9.3.6 で定義される text rendering mode の名前付き定数。
 * 各 key は PDF.js / poppler 等の慣用名を踏襲。
 */
const Mode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_CLIP: 4,
  STROKE_CLIP: 5,
  FILL_STROKE_CLIP: 6,
  CLIP: 7,
} as const satisfies Record<string, number>;

type TextRenderingModeValue = (typeof Mode)[keyof typeof Mode];

/**
 * PDF 仕様 §9.3.6 の text rendering mode。
 * 0 = Fill (グリフを塗りつぶす, デフォルト)
 * 1 = Stroke (グリフの輪郭線のみ描画)
 * 2 = Fill, then stroke (塗りつぶした上に輪郭線を描画)
 * 3 = Invisible (描画しない, 検索/選択用)
 * 4 = Fill, then add to path for clipping (塗りつぶし後、クリッピングパスへ追加)
 * 5 = Stroke, then add to path for clipping (輪郭線描画後、クリッピングパスへ追加)
 * 6 = Fill, then stroke, then add to path for clipping (塗+線後、クリッピングパスへ追加)
 * 7 = Add text to path for clipping (描画なしでクリッピングパスへ追加)
 *
 * Brand の基底型を 0|1|2|3|4|5|6|7 リテラル union に絞り categorical domain を型レベルで保持する。
 */
export type TextRenderingMode = Brand<
  TextRenderingModeValue,
  typeof TextRenderingModeBrand
>;

export const TextRenderingMode = {
  /** PDF §9.3.6 Mode 0 — グリフを塗りつぶす (デフォルト)。 */
  FILL: Mode.FILL,
  /** PDF §9.3.6 Mode 1 — グリフの輪郭線のみ描画。 */
  STROKE: Mode.STROKE,
  /** PDF §9.3.6 Mode 2 — 塗りつぶした上に輪郭線を描画。 */
  FILL_STROKE: Mode.FILL_STROKE,
  /** PDF §9.3.6 Mode 3 — 描画しない (検索/選択用)。 */
  INVISIBLE: Mode.INVISIBLE,
  /** PDF §9.3.6 Mode 4 — 塗りつぶし後、クリッピングパスへ追加。 */
  FILL_CLIP: Mode.FILL_CLIP,
  /** PDF §9.3.6 Mode 5 — 輪郭線描画後、クリッピングパスへ追加。 */
  STROKE_CLIP: Mode.STROKE_CLIP,
  /** PDF §9.3.6 Mode 6 — 塗+線後、クリッピングパスへ追加。 */
  FILL_STROKE_CLIP: Mode.FILL_STROKE_CLIP,
  /** PDF §9.3.6 Mode 7 — 描画なしでクリッピングパスへ追加。 */
  CLIP: Mode.CLIP,

  /**
   * PDF §9.3.6 が定める text rendering mode の許容値 (FILL 〜 CLIP)。
   * `readonly [0,1,2,3,4,5,6,7]` のリテラル tuple 型を保持しつつ
   * `readonly number[]` への代入互換性を `satisfies` で静的検査する。
   * categorical operand を扱う `PdfError` の `allowed: readonly number[]` に直接渡せる。
   */
  allowed: [
    Mode.FILL,
    Mode.STROKE,
    Mode.FILL_STROKE,
    Mode.INVISIBLE,
    Mode.FILL_CLIP,
    Mode.STROKE_CLIP,
    Mode.FILL_STROKE_CLIP,
    Mode.CLIP,
  ] as const satisfies readonly number[],

  /**
   * 任意の number が text rendering mode の許容値 (FILL〜CLIP の整数) かを判定する型ガード。
   * `true` を返した先で `n` は `TextRenderingModeValue` に narrow される。
   *
   * @param n - 検査対象の数値
   * @returns n が FILL〜CLIP のいずれかの整数なら true
   */
  isValid(n: number): n is TextRenderingModeValue {
    return Number.isInteger(n) && n >= Mode.FILL && n <= Mode.CLIP;
  },

  /**
   * FILL〜CLIP のいずれかを TextRenderingMode として返す。
   *
   * @param n - text rendering mode (FILL / STROKE / FILL_STROKE / INVISIBLE / FILL_CLIP / STROKE_CLIP / FILL_STROKE_CLIP / CLIP)
   * @returns Brand 付き TextRenderingMode
   */
  create(n: TextRenderingModeValue): TextRenderingMode {
    return n as TextRenderingMode;
  },
} as const;
