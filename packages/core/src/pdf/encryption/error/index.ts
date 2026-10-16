import type { ByteOffset } from "../../types/byte-offset/index";

/** 暗号化辞書の構造・値の誤り。key は /CF 内も含む辞書キーのパス。 */
export type EncryptError = {
  readonly code:
    | "MISSING_REQUIRED_KEY"
    | "INVALID_KEY_TYPE"
    | "INVALID_KEY_LENGTH"
    | "UNDEFINED_CRYPT_FILTER"
    | "UNKNOWN_CRYPT_FILTER_METHOD"
    | "INVALID_PERMISSIONS";
  readonly key: string;
  readonly offset: ByteOffset;
  readonly message: string;
};

export const EncryptError = {
  /** 構造エラーに辞書位置とキーのパスを付ける。 */
  create(
    error: Omit<EncryptError, "offset">,
    offset: ByteOffset,
  ): EncryptError {
    return { ...error, offset };
  },
} as const;
