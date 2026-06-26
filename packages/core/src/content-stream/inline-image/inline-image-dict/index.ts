import type { TokenInlineImageDictEntry, TokenName } from "../../../pdf/index";
import { TokenType } from "../../../pdf/index";

/**
 * PDF §8.9.5.1 で定義される **インラインイメージ辞書** の正規化前/後の値域。
 * `BI` と `ID` の間に出現するキー/値ペア列を表す。
 */
export type InlineImageDict = ReadonlyArray<TokenInlineImageDictEntry>;

/**
 * PDF §8.9.5.1 Table 89 で定義されるインラインイメージ辞書の略号 → 完全名対応表。
 *
 * BI / ID / EI で囲まれたインラインイメージ辞書は、サイズ削減のため
 * 以下のキーを 1〜3 文字の略号で記述できる。本テーブルは normalize が
 * 略号 entry を完全名 entry に展開するためのルックアップ表として使う。
 *
 * 値型を `Partial<Record<string, string>>` で表現することで、未登録キーへの
 * インデックスアクセスが `string | undefined` を返す（型上の正直さ）。
 */
const INLINE_IMAGE_DICT_ABBREVIATIONS: Partial<Record<string, string>> = {
  W: "Width",
  H: "Height",
  BPC: "BitsPerComponent",
  CS: "ColorSpace",
  F: "Filter",
  D: "Decode",
  DP: "DecodeParms",
  IM: "ImageMask",
  I: "Interpolate",
};

/**
 * インラインイメージ辞書 (`InlineImageDict`) に対する純粋関数を束ねる
 * ドメイン特化コンパニオン。
 *
 * 現状は `normalize`（略号→完全名展開）のみを公開する。
 * 将来 `expandValueAbbrevs`（値側 alias 展開）等を集約する余地を残す。
 * 画像そのもの（width / height 等の高レベル API）は別ドメインの InlineImage
 * コンパニオン（`inline-image/inline-image/index.ts` 等）として将来切り出す。
 */
export const InlineImageDict = {
  /**
   * インラインイメージ辞書の **キーのみ** を略号から完全名に展開する純関数。
   *
   * - 略号テーブルに hit したキーは完全名で置換した新エントリを返す。
   *   新 `TokenName.offset` は略号 entry の元 offset を保持する
   *   （後続 handler のエラー位置情報として活用）。
   * - 略号テーブルに miss したキー（完全名・未知キー・空文字）は元エントリをそのまま通す。
   * - 値配列 `value: ReadonlyArray<Token>` は加工しない。
   *   ColorSpace / Filter の値側略号（`/CS /RGB` → `/DeviceRGB` 等）は本 normalize のスコープ外で、
   *   後続フェーズ（handler または別 normalize）の責務。
   * - 入力配列・入力エントリは破壊しない（新配列を返す）。
   * - 同一 dict に略号と完全名が両方ある場合も重複検査は行わず順序通り両方を出力する。
   *
   * @param dict tokenizer が組み立てた inline image 辞書
   * @returns 略号を完全名に展開した新しい辞書（順序保持）
   */
  normalize: (dict: InlineImageDict): InlineImageDict => {
    return dict.map((entry) => {
      const key = entry.key.value;
      // Object.prototype 由来キー (`constructor` / `toString` / `__proto__` 等) が
      // 誤って略号として hit するのを防ぐため hasOwn ガードで自前プロパティのみ参照する。
      const expanded = Object.hasOwn(INLINE_IMAGE_DICT_ABBREVIATIONS, key)
        ? INLINE_IMAGE_DICT_ABBREVIATIONS[key]
        : undefined;
      if (expanded === undefined) {
        return entry;
      }
      const expandedKey: TokenName = {
        type: TokenType.Name,
        value: expanded,
        offset: entry.key.offset,
      };
      return { key: expandedKey, value: entry.value };
    });
  },
} as const;
