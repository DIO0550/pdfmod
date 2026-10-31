import { ok, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import { CryptFilters } from "../../crypt-filters/index";
import type { EncryptError } from "../../error/index";
import { AesKeyMaterial } from "../aes-key-material/index";

const BITS_256 = 256;

/** /V 5 の両リビジョンが共有する辞書パラメーター。 */
export type Aes256Parameters = {
  readonly keyLength: typeof BITS_256;
  readonly cryptFilters: CryptFilters;
  readonly keys: AesKeyMaterial;
};

export const Aes256Parameters = {
  /**
   * crypt filterと追加鍵を読む。直下の /Length は使用しない。
   * @param reader 暗号化辞書とエラー位置。
   * @returns 256ビット固定のパラメーター。フィルターや必須鍵が不正ならエラー。
   */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<Aes256Parameters, EncryptError> {
    const filters = CryptFilters.fromDictionary(reader);

    if (!filters.ok) {
      return filters;
    }

    const keys = AesKeyMaterial.fromDictionary(reader);

    if (!keys.ok) {
      return keys;
    }

    return ok({
      keyLength: BITS_256,
      cryptFilters: filters.value,
      keys: keys.value,
    });
  },
} as const;
