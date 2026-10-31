import { map, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import type { EncryptError } from "../../error/index";
import { KeyLength } from "../../key-length/index";

/** /V 2 /R 3 の可変長RC4。 */
export type V2R3 = {
  readonly kind: "V2R3";
  readonly keyLength: KeyLength;
};

export const V2R3 = {
  /**
   * 暗号化辞書から可変鍵長を読む。/V・/R の選択は StandardAlgorithm が担当する。
   * @param reader 暗号化辞書とエラー位置。
   * @returns 鍵長を持つ方式。/Length の型・値が不正ならエラー。
   */
  fromDictionary(reader: PdfDictionaryReader): Result<V2R3, EncryptError> {
    return map(KeyLength.fromEncryptionDictionary(reader), (keyLength) => ({
      kind: "V2R3",
      keyLength,
    }));
  },
} as const;
