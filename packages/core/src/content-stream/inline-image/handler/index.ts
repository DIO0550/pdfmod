import type { PdfError } from "../../../pdf/errors/index";
import type {
  TokenInlineImage,
  TokenInlineImageDictEntry,
} from "../../../pdf/index";
import { TokenType } from "../../../pdf/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { OperatorHandlerContext } from "../../operator-registry/index";
import { normalizeInlineImageDict } from "../normalizer/index";

/** ImageMask=false 時の必須キー列（検査順）。 */
const REQUIRED_KEYS_NON_MASK = [
  "Width",
  "Height",
  "BitsPerComponent",
  "ColorSpace",
] as const;

/**
 * ImageMask=true 時の必須キー列。
 * ISO 32000-1:2008 §8.9.5 Table 89 における stencil mask の扱い:
 *   - BitsPerComponent: optional（不在時の default 値は 1）
 *   - ColorSpace: 禁止（仕様上 stencil mask では指定してはならない）
 * 本フェーズの handler は存在検査のみを行うため、CS が存在した場合も
 * 「禁止違反」としては弾かず（透過する）、後続フェーズでのバリデーション責務とする。
 */
const REQUIRED_KEYS_MASK = ["Width", "Height"] as const;

type RequiredKey = (typeof REQUIRED_KEYS_NON_MASK)[number];

/**
 * PDF §8.9 InlineImage (`BI ... ID ... EI`) のハンドラ骨格。
 *
 * 検査順序（厳守）:
 *   (1) `normalizeInlineImageDict(token.dict)` で略号→完全名を展開
 *   (2) ImageMask の真偽判定（`TokenBoolean` かつ `value === true`）
 *   (3) 必須キー存在検査: Width → Height → BitsPerComponent → ColorSpace
 *       ImageMask=true（stencil mask）の場合、ISO 32000-1:2008 §8.9.5 Table 89 に従い:
 *         - BitsPerComponent は optional（不在時の default 値は 1）
 *         - ColorSpace は仕様上禁止（指定してはならない）。本フェーズの handler は存在
 *           検査のみのため、CS が存在しても禁止違反として弾かず透過する
 *
 * 重複キーの扱い:
 *   `TokenInlineImage.dict` は重複と順序を保持する `ReadonlyArray` 型である。本フェーズでは
 *   「最初に出現したエントリ」を採用する（`Array.prototype.find` / `some` のセマンティクスに従う）。
 *   ImageMask 判定も同じく最初の `/ImageMask` 系エントリのみを参照する。
 *
 * 本フェーズで行わないこと:
 *   - value 側の型検査（例: `/Width 16` の 16 が integer か否か）
 *   - filter (`/Filter`) チェイン適用
 *   - `data: Uint8Array` の decode
 *   - 画像描画
 *
 * 不変条件:
 *   - 成功時は `operandStack` / `graphicsStateStack` を同一参照で返す
 *   - InlineImage は operand を取らないため operand stack は触らない
 *
 * @param context - 実行コンテキスト (operand stack / graphics state stack)
 * @param token - 解釈対象の inline image token
 * @returns 成功なら入力と同一参照の context、失敗なら PdfError
 */
export const inlineImageHandler = (
  context: OperatorHandlerContext,
  token: TokenInlineImage,
): Result<OperatorHandlerContext, PdfError> => {
  const normalized = normalizeInlineImageDict(token.dict);
  const imageMask = isImageMaskTrue(normalized);
  const requiredKeys = imageMask ? REQUIRED_KEYS_MASK : REQUIRED_KEYS_NON_MASK;

  const missing = findFirstMissingKey(normalized, requiredKeys);
  if (missing !== undefined) {
    return err({
      code: "INLINE_IMAGE_REQUIRED_KEY_MISSING",
      message: `Inline image is missing required key '${missing}'`,
      missingKey: missing,
      offset: token.offset,
    });
  }

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
  });
};

/**
 * dict 内の最初の `/ImageMask` エントリが `TokenBoolean(true)` かを判定する。
 */
function isImageMaskTrue(
  entries: ReadonlyArray<TokenInlineImageDictEntry>,
): boolean {
  const entry = entries.find((e) => e.key.value === "ImageMask");
  if (entry === undefined) {
    return false;
  }
  const first = entry.value[0];
  if (first === undefined) {
    return false;
  }
  return first.type === TokenType.Boolean && first.value === true;
}

/**
 * 必須キー列を順に走査し、最初に欠落したキーを返す。すべて存在すれば undefined。
 */
function findFirstMissingKey(
  entries: ReadonlyArray<TokenInlineImageDictEntry>,
  requiredKeys: ReadonlyArray<RequiredKey>,
): RequiredKey | undefined {
  for (const key of requiredKeys) {
    const exists = entries.some((e) => e.key.value === key);
    if (!exists) {
      return key;
    }
  }
  return undefined;
}
