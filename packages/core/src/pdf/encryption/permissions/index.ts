import { err, ok, type Result } from "../../../utils/result/index";
import type { ByteOffset } from "../../types/byte-offset/index";
import { EncryptError } from "../error/index";

const MIN_SIGNED = -2147483648;
const MAX_UNSIGNED = 4294967295;

/** /P の符号付き32ビット表現。 */
export type Permissions = { readonly bits: number };

export const Permissions = {
  /** 符号付き・符号なし32ビット表記を同じビットパターンへ正規化する。 */
  fromInteger(
    value: number,
    offset: ByteOffset,
  ): Result<Permissions, EncryptError> {
    const valid =
      Number.isInteger(value) && value >= MIN_SIGNED && value <= MAX_UNSIGNED;

    if (!valid) {
      return err(
        EncryptError.create(
          {
            code: "INVALID_PERMISSIONS",
            key: "/P",
            message: `/P ${value} does not fit in 32 bits`,
          },
          offset,
        ),
      );
    }

    return ok({ bits: value | 0 });
  },
} as const;
