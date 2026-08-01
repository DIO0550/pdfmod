import type { Brand } from "../../../utils/brand/index";

declare const DashPatternBrand: unique symbol;

type DashPatternFields = {
  readonly array: ReadonlyArray<number>;
  readonly phase: number;
};

/**
 * PDF content stream の dash pattern setting operator (`d`) が設定する
 * 破線パターン (ISO 32000-1:2008 §8.4.3.6)。
 *
 * `array` は dash の on / off 長を交互に並べた列で、空配列は solid line を表す。
 * `phase` はパターン内の開始オフセット。
 * フィールドは型上 readonly であり、直接 mutate してはならない
 * (`Object.freeze` はしないため実行時に強制されるわけではない)。
 *
 * 値の検証 (負値 / `NaN` / `Infinity` / 奇数長 / 全要素 0 など) はここでは行わない。
 * operand の型検証は operator handler 層 (`d` handler) が担う。
 * 値の妥当性検証をどの層で行うかは未確定であり、上位層の方針に従う。
 */
export type DashPattern = Brand<DashPatternFields, typeof DashPatternBrand>;

export const DashPattern = {
  /**
   * 破線なし (solid line) を表す `DashPattern` を返す。
   * graphics state の初期値 (`[] 0 d` 相当) に対応する。
   *
   * 参照同一性 (singleton かどうか) は API 契約にしない。
   * 呼び出し側は `toEqual` で構造比較すること (`toBe` / `not.toBe` を assert しない)。
   *
   * ただし **共有された mutable 配列は返さない**ことは契約とする。
   * 実行時 freeze をしないため、共有配列を返すと呼び出し側の mutate が
   * 以降のすべての呼び出し元へ波及してしまう。
   *
   * @returns `array` が空配列、`phase` が 0 の `DashPattern`
   */
  solid(): DashPattern {
    return { array: [], phase: 0 } as unknown as DashPattern;
  },
  /**
   * `array` と `phase` を保持する `DashPattern` を生成する。
   *
   * `array` は `[...array]` でコピーして保持する。
   * これにより呼び出し側が元配列を後から変更しても、
   * 生成済み `DashPattern` の `array` は影響を受けない
   * (保証するのは「入力配列の後続 mutate からの隔離」であり、
   * 返却後の `array` が実行時に freeze されるわけではない)。
   *
   * 値の検証は行わず、渡された値をそのまま保持する。
   *
   * @param array - dash の on / off 長を交互に並べた列。空配列は solid line を表す
   * @param phase - パターン内の開始オフセット
   * @returns `array` のコピーと `phase` を保持する `DashPattern`
   */
  create(array: ReadonlyArray<number>, phase: number): DashPattern {
    return { array: [...array], phase } as unknown as DashPattern;
  },
} as const;
