import { ok, type Result } from "../../../utils/result/index";
import { EncryptDictReader } from "../dict-reader/index";
import type { EncryptError } from "../error/index";
import { Permissions } from "../permissions/index";
import type { StandardAlgorithm } from "../standard-algorithm/index";

/** /Standard のアルゴリズムと共通キー。 */
export type StandardSecurityHandler = {
  readonly algorithm: StandardAlgorithm;
  readonly ownerKey: Uint8Array;
  readonly userKey: Uint8Array;
  readonly permissions: Permissions;
  readonly encryptMetadata: boolean;
};

export const StandardSecurityHandler = {
  /** 対応済みアルゴリズムの /O・/U・/P・/EncryptMetadata を読む。 */
  fromDictionary(
    reader: EncryptDictReader,
    algorithm: StandardAlgorithm,
  ): Result<StandardSecurityHandler, EncryptError> {
    const owner = EncryptDictReader.required(reader, {
      key: "O",
      type: "string",
    });

    if (!owner.ok) {
      return owner;
    }

    const user = EncryptDictReader.required(reader, {
      key: "U",
      type: "string",
    });

    if (!user.ok) {
      return user;
    }

    const p = EncryptDictReader.required(reader, { key: "P", type: "integer" });

    if (!p.ok) {
      return p;
    }

    const permissions = Permissions.fromInteger(p.value.value, reader.offset);

    if (!permissions.ok) {
      return permissions;
    }

    const metadata = EncryptDictReader.optional(reader, {
      key: "EncryptMetadata",
      type: "boolean",
    });

    if (!metadata.ok) {
      return metadata;
    }

    return ok({
      algorithm,
      ownerKey: owner.value.value,
      userKey: user.value.value,
      permissions: permissions.value,
      encryptMetadata: metadata.value.some ? metadata.value.value.value : true,
    });
  },
} as const;
