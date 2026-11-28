import { AES_BLOCK_BYTES } from "../block/index";
import { multiplyByX, S_BOX } from "../byte/index";

const WORD_BYTES = 4;
const LAST_WORD_BYTE = WORD_BYTES - 1;
const AES_ROUND_BASE = 6;
export const AesKeyLengths = { Aes128: 16, Aes256: 32 } as const;

/**
 * FIPS 197 §5.2 の鍵スケジュールを展開する。
 * @param key 生成時に検証した 16 または 32 バイトの鍵。
 * @returns 先頭に元の鍵を含むラウンド鍵。
 */
export function expandRoundKeys(key: Uint8Array): Uint8Array {
  const rounds = key.length / WORD_BYTES + AES_ROUND_BASE;
  const expanded = new Uint8Array((rounds + 1) * AES_BLOCK_BYTES);
  expanded.set(key);

  const word = new Uint8Array(WORD_BYTES);
  let roundConstant = 1;

  for (
    let offset = key.length;
    offset < expanded.length;
    offset += WORD_BYTES
  ) {
    const previousOffset = offset - WORD_BYTES;

    for (let i = 0; i < WORD_BYTES; i++) {
      word[i] = expanded[previousOffset + i];
    }

    const offsetInKey = offset % key.length;

    if (offsetInKey === 0) {
      const firstByte = word[0];
      word[0] = S_BOX[word[1]] ^ roundConstant;
      word[1] = S_BOX[word[2]];
      word[2] = S_BOX[word[LAST_WORD_BYTE]];
      word[LAST_WORD_BYTE] = S_BOX[firstByte];
      roundConstant = multiplyByX(roundConstant);
    }

    if (
      key.length === AesKeyLengths.Aes256 &&
      offsetInKey === AES_BLOCK_BYTES
    ) {
      // AES-256 は鍵の中間のワードにも SubWord を適用する。
      for (let i = 0; i < WORD_BYTES; i++) {
        word[i] = S_BOX[word[i]];
      }
    }

    for (let i = 0; i < WORD_BYTES; i++) {
      expanded[offset + i] = expanded[offset + i - key.length] ^ word[i];
    }
  }

  return expanded;
}
