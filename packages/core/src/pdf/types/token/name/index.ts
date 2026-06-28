import type { Option } from "../../../../utils/option/index";
import { some } from "../../../../utils/option/index";
import type { Result } from "../../../../utils/result/index";
import { ok } from "../../../../utils/result/index";
import type { PdfError } from "../../../errors/index";
import type { ByteOffset } from "../../byte-offset/index";
import type { PdfName } from "../../pdf-types/index";
import type { TokenType } from "../index";

/**
 * 名前オブジェクト (`/Name`) トークン。
 */
export interface TokenName {
  type: TokenType.Name;
  value: string;
  offset: ByteOffset;
}

/**
 * `TokenName` の domain utility を束ねた companion object。
 * 型と value を同一識別子で公開する declaration merging パターン。
 */
export const TokenName = {
  /**
   * Name token を PdfName へ変換する。常に成功する。
   *
   * @param token - 変換対象 token
   * @returns 変換した PdfName を含む `ok(some(...))`
   */
  toPdfValue(token: TokenName): Result<Option<PdfName>, PdfError> {
    return ok(some({ type: "name", value: token.value }));
  },
} as const;
