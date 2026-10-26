import { ObjectParser } from "../../../objects/object-parser/index";
import type { Result } from "../../../utils/result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import type { PdfDictionary } from "../../types/pdf-types/index";
import type { EncryptError } from "../index";
import { EncryptDictionary } from "../index";

export const parseEncryption = (
  entries: string,
): {
  readonly raw: PdfDictionary;
  readonly result: Result<EncryptDictionary, EncryptError>;
} => {
  const offset = ByteOffset.of("%PDF-\n ".length);
  const parsed = ObjectParser.parse(
    new TextEncoder().encode(`%PDF-\n << ${entries} >>`),
    offset,
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  if (parsed.value.type !== "dictionary") {
    throw new Error("暗号化辞書が必要です");
  }

  return {
    raw: parsed.value,
    result: EncryptDictionary.fromDictionary(parsed.value, offset),
  };
};

export const standardEntries = (
  version: number,
  revision: number,
  extra = "",
): string =>
  `/Filter /Standard /V ${version} /R ${revision} /O <00FF> /U (user) /P -4 ${extra}`;
