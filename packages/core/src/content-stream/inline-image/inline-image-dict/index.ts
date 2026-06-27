import { StringArrayEx } from "../../../ext/string-array/index";
import type {
  Token,
  TokenInlineImageDictEntry,
  TokenName,
} from "../../../pdf/index";
import { TokenType } from "../../../pdf/index";
import type { Option } from "../../../utils/option/index";

/**
 * PDF §8.9.5.1 で定義される **インラインイメージ辞書** の正規化前/後の値域。
 * `BI` と `ID` の間に出現するキー/値ペア列を表す。
 */
export type InlineImageDict = ReadonlyArray<TokenInlineImageDictEntry>;

/**
 * PDF §8.9.5.1 Table 89 で定義される必須キー（imageMask=false 時の検査順）。
 * `findMissingRequiredKey` の検査ループと、戻り値のリテラル union 派生元を兼ねる。
 */
const REQUIRED_KEYS_NON_MASK = [
  "Width",
  "Height",
  "BitsPerComponent",
  "ColorSpace",
] as const;

/**
 * stencil mask（ImageMask=true）時の必須キー列。
 * - BitsPerComponent: optional（不在時の default 値は 1）
 * - ColorSpace: 仕様上禁止（指定してはならない）。現実装は禁止違反を検知しない
 */
const REQUIRED_KEYS_MASK = ["Width", "Height"] as const;

/**
 * インラインイメージ辞書の必須キー名のリテラル union。
 *
 * `REQUIRED_KEYS_NON_MASK` が `REQUIRED_KEYS_MASK` の上位集合なので NON_MASK から派生で十分。
 * `findMissingRequiredKey` の戻り値型を narrow するために export し、
 * handler 側は `PdfInlineImageRequiredKeyMissingError["missingKey"]` 型変数への代入で
 * コンパイル時に型整合（dict 側と pdf/errors 側の二重ロック）を検査できる。
 */
export type InlineImageRequiredKey = (typeof REQUIRED_KEYS_NON_MASK)[number];

/**
 * dict 内で最初に出現する指定キーの entry を返す module-private ヘルパ。
 * `isImageMaskTrue` から利用する。重複キーは最初の entry のみ採用する仕様外 PDF 防御。
 */
const findFirstEntry = (
  dict: InlineImageDict,
  key: string,
): TokenInlineImageDictEntry | undefined =>
  dict.find((entry) => entry.key.value === key);

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
const INLINE_IMAGE_DICT_KEY_ABBREVIATIONS: Partial<Record<string, string>> = {
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
 * PDF §8.9.5.1 Table 89 で定義される ColorSpace の値側略号 → 完全名対応表。
 *
 * `/ColorSpace` entry の value 配列内 Name token のみに適用する key scoped テーブル。
 * `expandValueAbbrevs` から消費する。`Object.hasOwn` ガード前提のため
 * 値型を `Partial<Record<string, string>>` で表現する。
 */
const INLINE_IMAGE_DICT_VALUE_COLORSPACE_ABBREVIATIONS: Partial<
  Record<string, string>
> = {
  G: "DeviceGray",
  RGB: "DeviceRGB",
  CMYK: "DeviceCMYK",
  I: "Indexed",
};

/**
 * PDF §8.9.5.1 Table 89 で定義される Filter の値側略号 → 完全名対応表。
 *
 * `/Filter` entry の value 配列内 Name token のみに適用する key scoped テーブル。
 */
const INLINE_IMAGE_DICT_VALUE_FILTER_ABBREVIATIONS: Partial<
  Record<string, string>
> = {
  AHx: "ASCIIHexDecode",
  A85: "ASCII85Decode",
  LZW: "LZWDecode",
  Fl: "FlateDecode",
  RL: "RunLengthDecode",
  CCF: "CCITTFaxDecode",
  DCT: "DCTDecode",
};

/**
 * Name token を指定テーブルで完全名に展開する module-private ヘルパ。
 *
 * - Name 以外の token はそのまま素通し（参照同一）。
 * - テーブルに hit しない Name token もそのまま素通し（参照同一）。
 * - hit した Name token は新 `TokenName` で置換する。`offset` は元 token を継承し
 *   後続フェーズのエラー位置情報として活用できるようにする。
 */
const expandIfAbbrevName = (
  token: Token,
  table: Partial<Record<string, string>>,
): Token => {
  if (token.type !== TokenType.Name) {
    return token;
  }
  const expanded = Object.hasOwn(table, token.value)
    ? table[token.value]
    : undefined;
  if (expanded === undefined) {
    return token;
  }
  const next: TokenName = {
    type: TokenType.Name,
    value: expanded,
    offset: token.offset,
  };
  return next;
};

/**
 * 値配列 (`ReadonlyArray<Token>`) 内の Name token を指定テーブルで展開する。
 *
 * 4 階層参照同一性ルールの value 階層を担う。
 * - 配列内置換ゼロ → 入力配列を同一参照で返す（呼び出し側で entry も同一参照に倒せる）
 * - 配列内置換あり → 新配列を生成し、非対象 token は同一参照、置換対象は新 token
 */
const expandValueArray = (
  value: ReadonlyArray<Token>,
  table: Partial<Record<string, string>>,
): ReadonlyArray<Token> => {
  let next: Token[] | undefined;
  for (let i = 0; i < value.length; i++) {
    const original = value[i] as Token;
    const replaced = expandIfAbbrevName(original, table);
    if (replaced === original) {
      if (next !== undefined) {
        next.push(original);
      }
      continue;
    }
    if (next === undefined) {
      next = value.slice(0, i);
    }
    next.push(replaced);
  }
  return next ?? value;
};

/**
 * インラインイメージ辞書 (`InlineImageDict`) に対する純粋関数を束ねる
 * ドメイン特化コンパニオン。
 *
 * 公開メソッド:
 *   - `normalize`               キー側略号 → 完全名への展開
 *   - `isImageMaskTrue`         `/ImageMask` Boolean(true) 判定
 *   - `findMissingRequiredKey`  必須キー欠落検査（imageMask フラグ別）
 *   - `expandValueAbbrevs`      `/ColorSpace` / `/Filter` の値側略号 → 完全名展開
 *
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
   *   コンパニオンの `expandValueAbbrevs` の責務。
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
      const expanded = Object.hasOwn(INLINE_IMAGE_DICT_KEY_ABBREVIATIONS, key)
        ? INLINE_IMAGE_DICT_KEY_ABBREVIATIONS[key]
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

  /**
   * dict 内の最初の `/ImageMask` entry の value[0] が `TokenBoolean(true)` のときのみ true を返す。
   *
   * - 完全名キーのみ参照する（略号 `/IM` を解釈する責務は `normalize`）。
   * - 重複 `/ImageMask` は最初の entry のみを採用する（仕様外 PDF への防御、Array.find のセマンティクス）。
   * - value 配列が空、value[0] が Boolean 以外、Boolean(false) のときはすべて false。
   *
   * @param dict 既に `normalize` を経由した dict を想定するが、未経由でも安全に false を返す
   */
  isImageMaskTrue: (dict: InlineImageDict): boolean => {
    const entry = findFirstEntry(dict, "ImageMask");
    if (entry === undefined) {
      return false;
    }
    const first = entry.value[0];
    if (first === undefined) {
      return false;
    }
    return first.type === TokenType.Boolean && first.value === true;
  },

  /**
   * imageMask フラグに応じた必須キー集合（PDF §8.9.5.1 Table 89）が
   * dict にすべて存在するか検査し、欠落キーを `Option<InlineImageRequiredKey>` で返す。
   *
   * - 戻り値型を `InlineImageRequiredKey` に narrow することで呼び出し側のキャスト依存を排除する。
   * - dict は **`normalize` を経由した完全名キー** である前提（略号のまま渡すと欠落扱いになる）。
   * - 必須キー以外の余分なエントリは検査せず通す（例: stencil mask に ColorSpace があっても none）。
   * - 検査順は `REQUIRED_KEYS_NON_MASK` / `REQUIRED_KEYS_MASK` の配列順で決定論的に固定される。
   */
  findMissingRequiredKey: (
    dict: InlineImageDict,
    imageMask: boolean,
  ): Option<InlineImageRequiredKey> => {
    const required: ReadonlyArray<InlineImageRequiredKey> = imageMask
      ? REQUIRED_KEYS_MASK
      : REQUIRED_KEYS_NON_MASK;
    return StringArrayEx.firstMissing(
      dict.map((entry) => entry.key.value),
      required,
    );
  },

  /**
   * 値側略号（PDF §8.9.5.1 Table 89）を完全名に展開した新 dict を返す純関数。
   *
   * **前提条件**: 入力 dict は `normalize` を経由した **完全名キー** であること。
   * 略号キーのまま（例: `/CS` / `/F`）渡された場合は key scope 判定に match せず value 側略号は展開されない。
   * 呼び出し側は `expandValueAbbrevs(normalize(rawDict))` の順に必ず連鎖させること。
   *
   * **key scoped**: `/ColorSpace` または `/Filter` entry の value 配列内 Name token のみが対象。
   * 他キー（`/Width` / `/Decode` / `/Interpolate` 等）の value は走査せず entry を同一参照で素通す。
   *
   * 4 階層参照同一性ルール:
   *   - top-level dict: 常に新配列（`dict.map(...)` で必ず新規生成）
   *   - entry:           value 内に置換がなければ同一参照、置換があれば新規 `{ key, value }`
   *   - value:           配列内に置換がなければ同一参照、置換があれば新規配列
   *   - token:           置換対象（hit した Name token）のみ新 `TokenName` を生成、非対象は同一参照
   *
   * 入力非破壊（`normalize` と同じ pin down）: 入力 dict / entry / value 配列はいずれも書き換えない。
   *
   * 配列内 token の扱い:
   *   - Name 以外（Integer / Boolean / Array / Dict / Null / Real / String 等）は素通し
   *   - Name token は table に hit すれば新 token で置換（`offset` 継承）、miss すれば素通し
   *   - Array / Dict 系 token に対する **再帰展開はしない**（Table 89 は 1 階層の Name のみが対象）
   */
  expandValueAbbrevs: (dict: InlineImageDict): InlineImageDict => {
    return dict.map((entry) => {
      const key = entry.key.value;
      const table =
        key === "ColorSpace"
          ? INLINE_IMAGE_DICT_VALUE_COLORSPACE_ABBREVIATIONS
          : key === "Filter"
            ? INLINE_IMAGE_DICT_VALUE_FILTER_ABBREVIATIONS
            : undefined;
      if (table === undefined) {
        return entry;
      }
      const nextValue = expandValueArray(entry.value, table);
      if (nextValue === entry.value) {
        return entry;
      }
      return { key: entry.key, value: nextValue };
    });
  },
} as const;
