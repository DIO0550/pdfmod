import type { Option } from "../../../utils/option/index";
import { err, type Result } from "../../../utils/result/index";
import {
  type PdfDictionaryField,
  PdfDictionaryReader,
} from "../../dictionary-reader/index";
import type { PdfValue } from "../../types/pdf-types/index";
import { EncryptError } from "../error/index";

/** 共通の辞書読み取りエラーを暗号化APIのエラーへ変換する。 */
export const EncryptDictReader = {
  optional<T extends PdfValue["type"]>(
    reader: PdfDictionaryReader,
    field: PdfDictionaryField<T>,
  ): Result<Option<Extract<PdfValue, { type: T }>>, EncryptError> {
    const result = PdfDictionaryReader.optional(reader, field);

    if (!result.ok) {
      return err(EncryptError.create(result.error, reader.offset));
    }

    return result;
  },

  required<T extends PdfValue["type"]>(
    reader: PdfDictionaryReader,
    field: PdfDictionaryField<T>,
  ): Result<Extract<PdfValue, { type: T }>, EncryptError> {
    const result = PdfDictionaryReader.required(reader, field);

    if (!result.ok) {
      const message =
        result.error.code === "MISSING_REQUIRED_KEY"
          ? "Required encryption key is missing"
          : result.error.message;

      return err(
        EncryptError.create({ ...result.error, message }, reader.offset),
      );
    }

    return result;
  },
} as const;
