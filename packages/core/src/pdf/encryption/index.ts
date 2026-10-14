import { ok, type Result } from "../../utils/result/index";
import type { ByteOffset } from "../types/byte-offset/index";
import type { PdfDictionary } from "../types/pdf-types/index";
import { EncryptDictReader } from "./dict-reader/index";
import type { EncryptError } from "./error/index";
import { StandardAlgorithm } from "./standard-algorithm/index";
import { StandardSecurityHandler } from "./standard-security-handler/index";

export type { AuthEvent, CryptFilterMethod } from "./crypt-filters/index";
export {
  AuthEvents,
  CryptFilter,
  CryptFilterMethods,
  CryptFilterSelector,
  CryptFilters,
} from "./crypt-filters/index";
export { EncryptError } from "./error/index";
export { KeyLength, KeyLengths } from "./key-length/index";
export { Permissions } from "./permissions/index";
export { AesKeyMaterial, StandardAlgorithm } from "./standard-algorithm/index";
export { StandardSecurityHandler } from "./standard-security-handler/index";

/** /Encrypt の標準ハンドラ、または解釈せず保持する未対応辞書。 */
export type EncryptDictionary =
  | { readonly type: "Standard"; readonly handler: StandardSecurityHandler }
  | {
      readonly type: "Unsupported";
      readonly filter: string;
      readonly raw: PdfDictionary;
    };

export const EncryptDictionary = {
  /** 暗号化辞書を型へ変換する。辞書内の間接参照は解決しない。 */
  fromDictionary(
    dictionary: PdfDictionary,
    offset: ByteOffset,
  ): Result<EncryptDictionary, EncryptError> {
    const reader: EncryptDictReader = { dictionary, offset, path: "" };
    const filter = EncryptDictReader.required(reader, {
      key: "Filter",
      type: "name",
    });
    if (!filter.ok) {
      return filter;
    }
    const unsupported: EncryptDictionary = {
      type: "Unsupported",
      filter: filter.value.value,
      raw: dictionary,
    };
    if (filter.value.value !== "Standard") {
      return ok(unsupported);
    }
    const algorithm = StandardAlgorithm.fromDictionary(reader);
    if (!algorithm.ok) {
      return algorithm;
    }
    if (!algorithm.value.some) {
      return ok(unsupported);
    }
    const handler = StandardSecurityHandler.fromDictionary(
      reader,
      algorithm.value.value,
    );
    if (!handler.ok) {
      return handler;
    }
    return ok({ type: "Standard", handler: handler.value });
  },
} as const;
