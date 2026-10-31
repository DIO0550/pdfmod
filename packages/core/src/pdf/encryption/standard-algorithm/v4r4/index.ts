import { ok, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import { CryptFilters } from "../../crypt-filters/index";
import type { EncryptError } from "../../error/index";
import { KeyLength } from "../../key-length/index";

/** /V 4 /R 4 のcrypt filterによる方式選択。 */
export type V4R4 = {
  readonly kind: "V4R4";
  readonly keyLength: KeyLength;
  readonly cryptFilters: CryptFilters;
};

export const V4R4 = {
  /**
   * 暗号化辞書から可変鍵長とcrypt filterを読む。/V・/R の選択は StandardAlgorithm が担当する。
   * @param reader 暗号化辞書とエラー位置。
   * @returns 鍵長とフィルターを持つ方式。いずれかが不正ならエラー。
   */
  fromDictionary(reader: PdfDictionaryReader): Result<V4R4, EncryptError> {
    const keyLength = KeyLength.fromEncryptionDictionary(reader);

    if (!keyLength.ok) {
      return keyLength;
    }

    const filters = CryptFilters.fromDictionary(reader);

    if (!filters.ok) {
      return filters;
    }

    return ok({
      kind: "V4R4",
      keyLength: keyLength.value,
      cryptFilters: filters.value,
    });
  },
} as const;
