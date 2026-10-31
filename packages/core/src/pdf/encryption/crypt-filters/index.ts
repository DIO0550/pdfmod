import type { ValueOf } from "../../../utils/index";
import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { PdfDictionaryReader } from "../../dictionary-reader/index";
import { EncryptDictReader } from "../dict-reader/index";
import { EncryptError } from "../error/index";
import { KeyLength } from "../key-length/index";

export const CryptFilterMethods = {
  None: "None",
  V2: "V2",
  AesV2: "AESV2",
  AesV3: "AESV3",
} as const;

export type CryptFilterMethod = ValueOf<typeof CryptFilterMethods>;

export const AuthEvents = { DocOpen: "DocOpen", EfOpen: "EFOpen" } as const;

export type AuthEvent = ValueOf<typeof AuthEvents>;

const AES_128_BITS = 128;
const AES_256_BITS = 256;

/** /CF の暗号方式・認証イベント・正規化済み鍵長。 */
export type CryptFilter = {
  readonly authEvent: AuthEvent;
  /** 入力辞書の /Length の正規化値。AES方式の固定鍵長とは独立して保持する。 */
  readonly length: Option<KeyLength>;
} & (
  | { readonly method: "None" }
  | { readonly method: "V2" }
  | { readonly method: "AESV2"; readonly keyLength: typeof AES_128_BITS }
  | { readonly method: "AESV3"; readonly keyLength: typeof AES_256_BITS }
);

export const CryptFilter = {
  /** /CF エントリを読む。AuthEvent と Length の不正値は Rust と同じく既定扱い。 */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<CryptFilter, EncryptError> {
    const method = EncryptDictReader.optional(reader, {
      key: "CFM",
      type: "name",
    });

    if (!method.ok) {
      return method;
    }

    const methodName = method.value.some
      ? method.value.value.value
      : CryptFilterMethods.None;
    const parsedMethod = CryptFilter.methodFromName(methodName);

    if (!parsedMethod.some) {
      return err(
        EncryptError.create(
          {
            code: "UNKNOWN_CRYPT_FILTER_METHOD",
            key: `${reader.path}/CFM`,
            message: `Unknown crypt filter method /${methodName}`,
          },
          reader.offset,
        ),
      );
    }

    const auth = reader.dictionary.entries.get("AuthEvent");
    const isEfOpen = auth?.type === "name" && auth.value === AuthEvents.EfOpen;

    const length = reader.dictionary.entries.get("Length");
    const parsedLength =
      length?.type === "integer"
        ? KeyLength.fromCryptFilterLength(length.value)
        : none;

    const attributes = {
      authEvent: isEfOpen ? AuthEvents.EfOpen : AuthEvents.DocOpen,
      length: parsedLength,
    };

    switch (parsedMethod.value) {
      case "None":
        return ok({ ...attributes, method: "None" });

      case "V2":
        return ok({ ...attributes, method: "V2" });

      case "AESV2":
        return ok({ ...attributes, method: "AESV2", keyLength: AES_128_BITS });

      case "AESV3":
        return ok({ ...attributes, method: "AESV3", keyLength: AES_256_BITS });
    }
  },

  /** 仕様の4方式だけを名前から受理する。 */
  methodFromName(name: string): Option<CryptFilterMethod> {
    switch (name) {
      case CryptFilterMethods.None:
        return some(CryptFilterMethods.None);

      case CryptFilterMethods.V2:
        return some(CryptFilterMethods.V2);

      case CryptFilterMethods.AesV2:
        return some(CryptFilterMethods.AesV2);

      case CryptFilterMethods.AesV3:
        return some(CryptFilterMethods.AesV3);

      default:
        return none;
    }
  },
} as const;

/** /Identity は /CF に定義を必要としない。 */
export type CryptFilterSelector =
  | { readonly type: "Identity" }
  | { readonly type: "Named"; readonly name: string };

export const CryptFilterSelector = {
  /** /Identity と辞書に定義された名前を区別する。 */
  fromName(
    name: string,
    filters: CryptFilters["filters"],
    reader: PdfDictionaryReader,
  ): Result<CryptFilterSelector, EncryptError> {
    if (name === "Identity") {
      return ok({ type: "Identity" });
    }

    if (!filters.has(name)) {
      return err(
        EncryptError.create(
          {
            code: "UNDEFINED_CRYPT_FILTER",
            key: reader.path,
            message: `Crypt filter /${name} is not defined in /CF`,
          },
          reader.offset,
        ),
      );
    }

    return ok({ type: "Named", name });
  },
} as const;

/** /CF とストリーム・文字列・埋め込みファイルへの割り当て。 */
export type CryptFilters = {
  readonly filters: ReadonlyMap<string, CryptFilter>;
  readonly stream: CryptFilterSelector;
  readonly string: CryptFilterSelector;
  readonly embeddedFile: Option<CryptFilterSelector>;
};

export const CryptFilters = {
  /** /V 4 以降の /CF とセレクタを読む。 */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<CryptFilters, EncryptError> {
    const dictionary = EncryptDictReader.required(reader, {
      key: "CF",
      type: "dictionary",
    });

    if (!dictionary.ok) {
      return dictionary;
    }

    const filters = new Map<string, CryptFilter>();

    for (const [name, value] of dictionary.value.entries) {
      if (value.type !== "dictionary") {
        return err(
          EncryptError.create(
            {
              code: "INVALID_KEY_TYPE",
              key: `/CF/${name}`,
              message: `Expected dictionary, got ${value.type}`,
            },
            reader.offset,
          ),
        );
      }

      const filter = CryptFilter.fromDictionary({
        ...reader,
        dictionary: value,
        path: `/CF/${name}`,
      });

      if (!filter.ok) {
        return filter;
      }

      filters.set(name, filter.value);
    }

    const stream = CryptFilters.readSelector(reader, "StmF", filters);

    if (!stream.ok) {
      return stream;
    }

    const string = CryptFilters.readSelector(reader, "StrF", filters);

    if (!string.ok) {
      return string;
    }

    const embeddedFile = CryptFilters.readSelector(reader, "EFF", filters);

    if (!embeddedFile.ok) {
      return embeddedFile;
    }

    const identity: CryptFilterSelector = { type: "Identity" };

    return ok({
      filters,
      stream: stream.value.some ? stream.value.value : identity,
      string: string.value.some ? string.value.value : identity,
      embeddedFile: embeddedFile.value,
    });
  },

  /** 任意の名前を読み、/CF の定義を検証する。 */
  readSelector(
    reader: PdfDictionaryReader,
    key: "StmF" | "StrF" | "EFF",
    filters: CryptFilters["filters"],
  ): Result<Option<CryptFilterSelector>, EncryptError> {
    const name = EncryptDictReader.optional(reader, { key, type: "name" });

    if (!name.ok) {
      return name;
    }

    if (!name.value.some) {
      return ok(none);
    }

    const selector = CryptFilterSelector.fromName(
      name.value.value.value,
      filters,
      { ...reader, path: `/${key}` },
    );

    if (!selector.ok) {
      return selector;
    }

    return ok(some(selector.value));
  },
} as const;
