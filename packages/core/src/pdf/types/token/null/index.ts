import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfNull } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * `null` リテラルトークン。
 * PDF 仕様の `null` オブジェクトを保持するため、value は `null` 固定。
 */
export interface TokenNull {
  type: TokenType.Null;
  value: null;
  offset: ByteOffset;
}

/**
 * `TokenNull` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenNull = {
  /**
   * Null token を PdfNull へ変換する。常に成功する。
   *
   * @param _token - 変換対象 token（値は使用しない）
   * @returns 変換した PdfNull を含む `ok(some(...))`
   */
  toPdfValue(_token: TokenNull): Result<Option<PdfNull>, PdfError> {
    return ok(some({ type: "null" }));
  },
} as const;
