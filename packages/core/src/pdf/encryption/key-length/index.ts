import type { ValueOf } from "../../../utils/index";
import { none, type Option, some } from "../../../utils/option/index";

const BITS_PER_BYTE = 8;
const MIN_BYTES = 5;
const MAX_BYTES = 16;

/** 可変長 RC4 / AES-128 で使用できるビット数。 */
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

/** 可変長 RC4 / AES-128 の鍵長。単位はビット。 */
export type KeyLength = ValueOf<typeof KeyLengths>;

export const KeyLength = {
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
