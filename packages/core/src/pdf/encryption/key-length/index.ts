import type { ValueOf } from "../../../utils/index";
import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { PdfDictionaryReader } from "../../dictionary-reader/index";
import { EncryptDictReader } from "../dict-reader/index";
import { EncryptError } from "../error/index";

const BITS_PER_BYTE = 8;
const MIN_BYTES = 5;
const MAX_BYTES = 16;

/** 辞書で指定する可変長 で使用できるビット数。 */
export const KeyLengths = {
  Bits40: 40,
  Bits48: 48,
  Bits56: 56,
  Bits64: 64,
  Bits72: 72,
  Bits80: 80,
  Bits88: 88,
  Bits96: 96,
  Bits104: 104,
  Bits112: 112,
  Bits120: 120,
  Bits128: 128,
} as const;

/** 辞書で指定する可変長 の鍵長。単位はビット。 */
export type KeyLength = ValueOf<typeof KeyLengths>;

export const KeyLength = {
  /**
   * /V 2・4 の暗号化辞書直下の /Length を読む。省略時は40ビット。
   * @param reader 暗号化辞書とエラー位置。
   * @returns 可変鍵長。/Length の型やビット数が不正ならエラー。
   */
  fromEncryptionDictionary(
    reader: PdfDictionaryReader,
  ): Result<KeyLength, EncryptError> {
    const length = EncryptDictReader.optional(reader, {
      key: "Length",
      type: "integer",
    });

    if (!length.ok) {
      return length;
    }

    const bits = length.value.some
      ? length.value.value.value
      : KeyLengths.Bits40;
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

    return ok(keyLength.value);
  },

  /** 40..128 ビット、8 の倍数だけを受理する。 */
  fromBits(bits: number): Option<KeyLength> {
    const valid =
      Number.isInteger(bits) &&
      bits >= MIN_BYTES * BITS_PER_BYTE &&
      bits <= MAX_BYTES * BITS_PER_BYTE &&
      bits % BITS_PER_BYTE === 0;

    if (!valid) {
      return none;
    }

    return some(bits as KeyLength);
  },

  /** /CF の 5..16 はバイト表記、それ以外はビット表記として解釈する。 */
  fromCryptFilterLength(raw: number): Option<KeyLength> {
    const isBytes = raw >= MIN_BYTES && raw <= MAX_BYTES;
    const bits = isBytes ? raw * BITS_PER_BYTE : raw;

    if (!Number.isInteger(raw)) {
      return none;
    }

    return KeyLength.fromBits(bits);
  },
} as const;
