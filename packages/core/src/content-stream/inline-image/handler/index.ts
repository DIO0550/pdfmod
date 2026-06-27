import type {
  PdfError,
  PdfInlineImageRequiredKeyMissingError,
} from "../../../pdf/errors/index";
import type { TokenInlineImage } from "../../../pdf/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { OperatorHandlerContext } from "../../operator-registry/index";
import { InlineImageDict } from "../inline-image-dict/index";

/**
 * PDF §8.9 InlineImage (`BI ... ID ... EI`) のハンドラ骨格。
 *
 * 検査順序（厳守）:
 *   (1) `InlineImageDict.normalize(token.dict)` で略号→完全名を展開
 *   (2) `InlineImageDict.isImageMaskTrue(normalized)` で ImageMask の真偽判定
 *   (3) `InlineImageDict.findMissingRequiredKey(normalized, imageMask)` で必須キー検査
 *       - imageMask=false: Width → Height → BitsPerComponent → ColorSpace
 *       - imageMask=true (stencil mask): Width → Height のみ（BPC は optional / CS は仕様上禁止だが
 *         本実装は禁止違反を検知しない）
 *
 * 重複キーの扱い:
 *   `TokenInlineImage.dict` は重複と順序を保持する `ReadonlyArray` 型。本フェーズでは
 *   「最初に出現したエントリ」を採用する（`InlineImageDict.isImageMaskTrue` のセマンティクス）。
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
  const normalized = InlineImageDict.normalize(token.dict);
  const imageMask = InlineImageDict.isImageMaskTrue(normalized);
  const missing = InlineImageDict.findMissingRequiredKey(normalized, imageMask);
  if (missing.some) {
    // dict 側 InlineImageRequiredKey と pdf/errors 側 PdfInlineImageRequiredKeyMissingError["missingKey"]
    // の 2 union を変数代入で接続し、drift した瞬間に typecheck エラーで気付く二重ロックを構成する。
    const missingKey: PdfInlineImageRequiredKeyMissingError["missingKey"] =
      missing.value;
    return err({
      code: "INLINE_IMAGE_REQUIRED_KEY_MISSING",
      message: `Inline image is missing required key '${missingKey}'`,
      missingKey,
      offset: token.offset,
    });
  }

  return ok({
    operandStack: context.operandStack,
    graphicsStateStack: context.graphicsStateStack,
  });
};
