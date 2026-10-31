import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { PdfDictionaryReader } from "../../dictionary-reader/index";
import { CryptFilters } from "../crypt-filters/index";
import { EncryptDictReader } from "../dict-reader/index";
import { EncryptError } from "../error/index";
import { KeyLength } from "../key-length/index";

/** /R 5・6 でのみ必要となる暗号化ファイル鍵と権限のバイト列。 */
export type AesKeyMaterial = {
  readonly ownerEncryptedKey: Uint8Array;
  readonly userEncryptedKey: Uint8Array;
  readonly perms: Uint8Array;
};

export const AesKeyMaterial = {
  /** バイト列は長さを検証しない。検証は鍵導出の責務。 */
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

/** 有効な6組のみを表し、版固有のフィールドをその組に閉じ込める。 */
export type StandardAlgorithm =
  | { readonly kind: "V1R2"; readonly keyLength: typeof BITS_40 }
  | { readonly kind: "V1R3"; readonly keyLength: typeof BITS_40 }
  | { readonly kind: "V2R3"; readonly keyLength: KeyLength }
  | {
      readonly kind: "V4R4";
      readonly keyLength: KeyLength;
      readonly cryptFilters: CryptFilters;
    }
  | {
      readonly kind: "V5R5";
      readonly keyLength: typeof BITS_256;
      readonly cryptFilters: CryptFilters;
      readonly keys: AesKeyMaterial;
    }
  | {
      readonly kind: "V5R6";
      readonly keyLength: typeof BITS_256;
      readonly cryptFilters: CryptFilters;
      readonly keys: AesKeyMaterial;
    };

const BITS_40 = 40;
const BITS_256 = 256;

export const StandardAlgorithm = {
  /** /V と /R を読み、対応外の組は None とする。 */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<Option<StandardAlgorithm>, EncryptError> {
    const version = EncryptDictReader.required(reader, {
      key: "V",
      type: "integer",
    });

    if (!version.ok) {
      return version;
    }

    const revision = EncryptDictReader.required(reader, {
      key: "R",
      type: "integer",
    });

    if (!revision.ok) {
      return revision;
    }

    switch (`${version.value.value}:${revision.value.value}`) {
      case "1:2":
        return ok(some({ kind: "V1R2", keyLength: BITS_40 }));

      case "1:3":
        return ok(some({ kind: "V1R3", keyLength: BITS_40 }));

      case "2:3":
        return StandardAlgorithm.readVariableLength(reader, "V2R3");

      case "4:4":
        return StandardAlgorithm.readVariableLength(reader, "V4R4");

      case "5:5":
        return StandardAlgorithm.readAes256(reader, "V5R5");

      case "5:6":
        return StandardAlgorithm.readAes256(reader, "V5R6");

      default:
        return ok(none);
    }
  },

  /** /V 2・4 の可変長鍵を読む。 */
  readVariableLength(
    reader: PdfDictionaryReader,
    kind: "V2R3" | "V4R4",
  ): Result<Option<StandardAlgorithm>, EncryptError> {
    const length = EncryptDictReader.optional(reader, {
      key: "Length",
      type: "integer",
    });

    if (!length.ok) {
      return length;
    }

    const bits = length.value.some ? length.value.value.value : BITS_40;
    const keyLength = KeyLength.fromBits(bits);

    if (!keyLength.some) {
      return err(
        EncryptError.create(
          {
            code: "INVALID_KEY_LENGTH",
            key: "/Length",
            message: `Invalid file key length: ${bits} bits`,
          },
          reader.offset,
        ),
      );
    }

    if (kind === "V2R3") {
      return ok(some({ kind, keyLength: keyLength.value }));
    }

    const filters = CryptFilters.fromDictionary(reader);

    if (!filters.ok) {
      return filters;
    }

    return ok(
      some({ kind, keyLength: keyLength.value, cryptFilters: filters.value }),
    );
  },

  /** /V 5 の crypt filter と追加鍵を読む。直下の /Length は使用しない。 */
  readAes256(
    reader: PdfDictionaryReader,
    kind: "V5R5" | "V5R6",
  ): Result<Option<StandardAlgorithm>, EncryptError> {
    const filters = CryptFilters.fromDictionary(reader);

    if (!filters.ok) {
      return filters;
    }

    const keys = AesKeyMaterial.fromDictionary(reader);

    if (!keys.ok) {
      return keys;
    }

    return ok(
      some({
        kind,
        keyLength: BITS_256,
        cryptFilters: filters.value,
        keys: keys.value,
      }),
    );
  },

  /** ファイル暗号鍵の長さをビット単位で返す。 */
  keyLength<T extends StandardAlgorithm>(algorithm: T): T["keyLength"] {
    return algorithm.keyLength;
  },
} as const;
