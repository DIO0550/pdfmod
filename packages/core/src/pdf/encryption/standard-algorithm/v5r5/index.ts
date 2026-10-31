import { map, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import type { EncryptError } from "../../error/index";
import { Aes256Parameters } from "../aes256-parameters/index";

/** /V 5 /R 5 のAES-256。 */
export type V5R5 = Aes256Parameters & {
  readonly kind: "V5R5";
};

export const V5R5 = {
  /**
   * AES-256の辞書パラメーターを読む。/V・/R の選択は StandardAlgorithm が担当する。
   * @param reader 暗号化辞書とエラー位置。
   * @returns リビジョン5の方式。パラメーターが不正ならエラー。
   */
  fromDictionary(reader: PdfDictionaryReader): Result<V5R5, EncryptError> {
    return map(Aes256Parameters.fromDictionary(reader), (parameters) => ({
      ...parameters,
      kind: "V5R5",
    }));
  },
} as const;
