import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { ByteOffset } from "../../types/byte-offset/index";
import type { PdfDictionary, PdfValue } from "../../types/pdf-types/index";
import { EncryptError } from "../error/index";

/** 暗号化辞書の読み取り位置。間接参照の解決手段は持たない。 */
export type EncryptDictReader = {
  readonly dictionary: PdfDictionary;
  readonly offset: ByteOffset;
  readonly path: string;
};

type Field<T extends PdfValue["type"]> = {
  readonly key: string;
  readonly type: T;
};

export const EncryptDictReader = {
  /** 直接値を型付きで読む。不在は None、型不一致は位置付きエラー。 */
  optional<T extends PdfValue["type"]>(
    reader: EncryptDictReader,
    field: Field<T>,
  ): Result<Option<Extract<PdfValue, { type: T }>>, EncryptError> {
    const value = reader.dictionary.entries.get(field.key);
    if (value === undefined) {
      return ok(none);
    }
    if (value.type !== field.type) {
      return err(
        EncryptError.create(
          {
            code: "INVALID_KEY_TYPE",
            key: `${reader.path}/${field.key}`,
            message: `Expected ${field.type}, got ${value.type}`,
          },
          reader.offset,
        ),
      );
    }
    // 型引数 T と value.type の一致を実行時に確定させる境界。
    return ok(some(value as Extract<PdfValue, { type: T }>));
  },

  /** 必須の直接値を読む。不在と型不一致を区別する。 */
  required<T extends PdfValue["type"]>(
    reader: EncryptDictReader,
    field: Field<T>,
  ): Result<Extract<PdfValue, { type: T }>, EncryptError> {
    const result = EncryptDictReader.optional(reader, field);
    if (!result.ok) {
      return result;
    }
    if (!result.value.some) {
      return err(
        EncryptError.create(
          {
            code: "MISSING_REQUIRED_KEY",
            key: `${reader.path}/${field.key}`,
            message: "Required encryption key is missing",
          },
          reader.offset,
        ),
      );
    }
    return ok(result.value.value);
  },
} as const;
