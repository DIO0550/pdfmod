import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

const HEX_PAIR_PATTERN = /^[0-9A-Fa-f]{2}$/;
const MAX_BYTE_VALUE = 0xff;

/**
 * 16進文字列をバイト配列に変換する。奇数桁の場合は末尾に 0 を補う。
 *
 * @param hex - 16進文字列
 * @returns バイト配列、または不正文字を含む場合はエラー
 */
export function decodeHexString(hex: string): Result<Uint8Array, string> {
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    const chunk = padded.substring(i, i + 2);
    if (!HEX_PAIR_PATTERN.test(chunk)) {
      return err(`Invalid hex digits in hex string: "${chunk}"`);
    }
    bytes[i / 2] = parseInt(chunk, 16);
  }
  return ok(bytes);
}

/**
 * リテラル文字列をバイト配列に変換する。
 *
 * @param str - リテラル文字列
 * @returns バイト配列、または 1 バイト範囲外の code unit を含む場合はエラー
 */
export function decodeLiteralString(str: string): Result<Uint8Array, string> {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const codeUnit = str.charCodeAt(i);
    if (codeUnit > MAX_BYTE_VALUE) {
      return err(
        `Invalid literal string byte value: ${codeUnit} at index ${i}`,
      );
    }
    bytes[i] = codeUnit;
  }
  return ok(bytes);
}
