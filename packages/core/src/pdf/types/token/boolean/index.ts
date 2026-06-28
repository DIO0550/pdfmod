import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfBoolean } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * Boolean リテラル (`true` / `false`) トークン。
 */
export interface TokenBoolean {
  type: TokenType.Boolean;
  value: boolean;
  offset: ByteOffset;
}

/**
 * `TokenBoolean` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenBoolean = {
  /**
   * Boolean token を PdfBoolean へ変換する。常に成功する。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfBoolean を含む `ok(some(...))`
   */
  toPdfValue(token: TokenBoolean): Result<Option<PdfBoolean>, PdfError> {
    return ok(some({ type: "boolean", value: token.value }));
  },
} as const;
