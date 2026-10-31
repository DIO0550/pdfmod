import { ok, type Result } from "../../../../utils/result/index";
import type { PdfDictionaryReader } from "../../../dictionary-reader/index";
import { EncryptDictReader } from "../../dict-reader/index";
import type { EncryptError } from "../../error/index";

/** /R 5・6 でのみ必要となる暗号化ファイル鍵と権限のバイト列。 */
export type AesKeyMaterial = {
  readonly ownerEncryptedKey: Uint8Array;
  readonly userEncryptedKey: Uint8Array;
  readonly perms: Uint8Array;
};

export const AesKeyMaterial = {
  /**
   * AESの追加鍵を読む。バイト列の長さの検証は鍵導出の責務。
   * @param reader 暗号化辞書とエラー位置。
   * @returns 鍵材料。必須キーの欠落・型不一致ならエラー。
   */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<AesKeyMaterial, EncryptError> {
    const owner = EncryptDictReader.required(reader, {
      key: "OE",
      type: "string",
    });

    if (!owner.ok) {
      return owner;
    }

    const user = EncryptDictReader.required(reader, {
      key: "UE",
      type: "string",
    });

    if (!user.ok) {
      return user;
    }

    const perms = EncryptDictReader.required(reader, {
      key: "Perms",
      type: "string",
    });

    if (!perms.ok) {
      return perms;
    }

    return ok({
      ownerEncryptedKey: owner.value.value,
      userEncryptedKey: user.value.value,
      perms: perms.value.value,
    });
  },
} as const;
