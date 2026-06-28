import { decodeHexString } from "../../../../objects/object-parser/string-decoder/index";
import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { err, ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfString } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * 16進文字列 (`<...>`) トークン。
 */
export interface TokenHexString {
  type: TokenType.HexString;
  value: string;
  offset: ByteOffset;
}

/**
 * `TokenHexString` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenHexString = {
  /**
   * Hex string token を PdfString(encoding:"hex") へ変換する。
   * `decodeHexString` の失敗時は `OBJECT_PARSE_UNEXPECTED_TOKEN` で
   * decode エラーメッセージをそのまま返す。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfString を含む `ok(some(...))`、または decode 失敗時のエラー
   */
  toPdfValue(token: TokenHexString): Result<Option<PdfString>, PdfError> {
    const decoded = decodeHexString(token.value);
    if (!decoded.ok) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: decoded.error,
        offset: token.offset,
      });
    }
    return ok(some({ type: "string", value: decoded.value, encoding: "hex" }));
  },
} as const;
