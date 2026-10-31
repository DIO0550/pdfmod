import { none, type Option, some } from "../../utils/option/index";
import { err, ok, type Result } from "../../utils/result/index";
import type { ByteOffset } from "../types/byte-offset/index";
import type { PdfDictionary, PdfValue } from "../types/pdf-types/index";

/** PDF辞書の読み取り位置。間接参照の解決手段は持たない。 */
export type PdfDictionaryReader = {
  readonly dictionary: PdfDictionary;
  readonly offset: ByteOffset;
  readonly path: string;
};

export type PdfDictionaryField<T extends PdfValue["type"]> = {
  readonly key: string;
  readonly type: T;
};

export const PdfDictionaryReader = {
  /** 直接値を型付きで読む。不在は None、型不一致は位置付きエラー。 */
  optional<T extends PdfValue["type"]>(
    reader: PdfDictionaryReader,
    field: PdfDictionaryField<T>,
  ): Result<Option<Extract<PdfValue, { type: T }>>, PdfDictionaryReadError> {
    const value = reader.dictionary.entries.get(field.key);

    if (value === undefined) {
      return ok(none);
    }

    if (value.type !== field.type) {
      return err(
        PdfDictionaryReadError.create(
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
    reader: PdfDictionaryReader,
    field: PdfDictionaryField<T>,
  ): Result<Extract<PdfValue, { type: T }>, PdfDictionaryReadError> {
    const result = PdfDictionaryReader.optional(reader, field);

    if (!result.ok) {
      return result;
    }

    if (!result.value.some) {
      return err(
        PdfDictionaryReadError.create(
          {
            code: "MISSING_REQUIRED_KEY",
            key: `${reader.path}/${field.key}`,
            message: "Required dictionary key is missing",
          },
          reader.offset,
        ),
      );
    }

    return ok(result.value.value);
  },
} as const;

/** 辞書の必須キー欠損・直接値の型不一致。 */
export type PdfDictionaryReadError = {
  readonly code: "MISSING_REQUIRED_KEY" | "INVALID_KEY_TYPE";
  readonly key: string;
  readonly offset: ByteOffset;
  readonly message: string;
};

export const PdfDictionaryReadError = {
  /** 辞書の構造エラーに読み取り位置を付ける。 */
  create(
    error: Omit<PdfDictionaryReadError, "offset">,
    offset: ByteOffset,
  ): PdfDictionaryReadError {
    return { ...error, offset };
  },
} as const;
