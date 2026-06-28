import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { err, ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfReal } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * 実数リテラル (`3.14`, `.5`) トークン。
 */
export interface TokenReal {
  type: TokenType.Real;
  value: number;
  offset: ByteOffset;
}

/**
 * `TokenReal` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenReal = {
  /**
   * Real token を PdfReal へ変換する。
   * value が NaN の場合は `OBJECT_PARSE_UNEXPECTED_TOKEN` エラーを返す。
   * `Number.isFinite` は呼ばず `Infinity` / `-Infinity` は素通しする（既存挙動）。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfReal を含む `ok(some(...))`、または NaN 入力時のエラー
   */
  toPdfValue(token: TokenReal): Result<Option<PdfReal>, PdfError> {
    if (Number.isNaN(token.value)) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `NaN real token at offset ${token.offset}`,
        offset: token.offset,
      });
    }
    return ok(some({ type: "real", value: token.value }));
  },
} as const;
