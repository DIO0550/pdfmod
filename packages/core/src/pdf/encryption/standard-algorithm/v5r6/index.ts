import { map, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import type { EncryptError } from "../../error/index";
import { Aes256Parameters } from "../aes256-parameters/index";

/** /V 5 /R 6 のAES-256。 */
export type V5R6 = Aes256Parameters & {
  readonly kind: "V5R6";
};

export const V5R6 = {
  /**
   * AES-256の辞書パラメーターを読む。/V・/R の選択は StandardAlgorithm が担当する。
   * @param reader 暗号化辞書とエラー位置。
   * @returns リビジョン6の方式。パラメーターが不正ならエラー。
   */
  fromDictionary(reader: PdfDictionaryReader): Result<V5R6, EncryptError> {
    return map(Aes256Parameters.fromDictionary(reader), (parameters) => ({
      ...parameters,
      kind: "V5R6",
    }));
  },
} as const;
