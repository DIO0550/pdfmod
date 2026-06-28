import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { err, ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfInteger } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * 整数リテラル (`123`, `-7`) トークン。
 */
export interface TokenInteger {
  type: TokenType.Integer;
  value: number;
  offset: ByteOffset;
}

/**
 * `TokenInteger` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenInteger = {
  /**
   * Integer token を PdfInteger へ変換する。
   * value が NaN の場合は `OBJECT_PARSE_UNEXPECTED_TOKEN` エラーを返す。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfInteger を含む `ok(some(...))`、または NaN 入力時のエラー
   */
  toPdfValue(token: TokenInteger): Result<Option<PdfInteger>, PdfError> {
    if (Number.isNaN(token.value)) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `NaN integer token at offset ${token.offset}`,
        offset: token.offset,
      });
    }
    return ok(some({ type: "integer", value: token.value }));
  },
} as const;
