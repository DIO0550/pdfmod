import { none, type Option, some } from "../../../../utils/option/index";
import { err, ok, type Result } from "../../../../utils/result/index";
import { AES_BLOCK_BYTES, createBlockCipher } from "./block/index";
import { AesKeyLengths, expandRoundKeys } from "./round-keys/index";

type CbcInput = {
  readonly iv: Uint8Array;
  readonly data: Uint8Array;
};

type CbcError = "INVALID_IV_LENGTH" | "INVALID_BLOCK_LENGTH";
type PdfCbcError = "INVALID_LENGTH" | "INVALID_PADDING";

/** 1 つの鍵を展開した AES-128 または AES-256。 */
export type Aes = {
  /** /Perms など、パディングのない 16 バイトを復号する。 */
  readonly decryptEcbBlock: (
    ciphertext: Uint8Array,
  ) => Result<Uint8Array, "INVALID_BLOCK_LENGTH">;

  /** IV を別に受け取り、完全なブロック列を復号する。パディングは保持する。 */
  readonly decryptCbcBlocks: (input: CbcInput) => Result<Uint8Array, CbcError>;

  /** Algorithm 2.B の作業ブロック列を暗号化する。パディングは付けない。 */
  readonly encryptCbcBlocks: (input: CbcInput) => Result<Uint8Array, CbcError>;

  /** AESV2/AESV3 の文字列・ストリームを復号する。先頭の IV と末尾のパディングは除く。 */
  readonly decryptPdfCbc: (
    input: Uint8Array,
  ) => Result<Uint8Array, PdfCbcError>;
};

function validateCbcInput({ iv, data }: CbcInput): Option<CbcError> {
  if (iv.length !== AES_BLOCK_BYTES) {
    return some("INVALID_IV_LENGTH");
  }

  if (data.length % AES_BLOCK_BYTES !== 0) {
    return some("INVALID_BLOCK_LENGTH");
  }

  return none;
}

function decryptCbc(roundKeys: Uint8Array, { iv, data }: CbcInput): Uint8Array {
  const cipher = createBlockCipher(roundKeys);
  const output = new Uint8Array(data.length);
  let previous = iv;
  let previousOffset = 0;

  for (let offset = 0; offset < data.length; offset += AES_BLOCK_BYTES) {
    const block = cipher.decrypt(data, offset);

    for (let i = 0; i < AES_BLOCK_BYTES; i++) {
      output[offset + i] = block[i] ^ previous[previousOffset + i];
    }

    previous = data;
    previousOffset = offset;
  }

  return output;
}

function encryptCbc(roundKeys: Uint8Array, { iv, data }: CbcInput): Uint8Array {
  const cipher = createBlockCipher(roundKeys);
  const output = new Uint8Array(data.length);
  const block = new Uint8Array(AES_BLOCK_BYTES);
  let previous = iv;
  let previousOffset = 0;

  for (let offset = 0; offset < data.length; offset += AES_BLOCK_BYTES) {
    for (let i = 0; i < AES_BLOCK_BYTES; i++) {
      block[i] = data[offset + i] ^ previous[previousOffset + i];
    }

    output.set(cipher.encrypt(block, 0), offset);
    previous = output;
    previousOffset = offset;
  }

  return output;
}

function removePdfPadding(
  plaintext: Uint8Array,
): Result<Uint8Array, PdfCbcError> {
  const lastIndex = plaintext.length - 1;
  const padding = plaintext[lastIndex];
  let mismatch = 0;

  // 不一致を見つけても、検査範囲は常に末尾の 1 ブロック。
  for (let i = 0; i < AES_BLOCK_BYTES; i++) {
    const mask = -Number(i < padding);
    mismatch |= (plaintext[lastIndex - i] ^ padding) & mask;
  }

  const validLength = padding >= 1 && padding <= AES_BLOCK_BYTES;

  if (!validLength || mismatch !== 0) {
    return err("INVALID_PADDING");
  }

  return ok(plaintext.subarray(0, plaintext.length - padding));
}

export const Aes = {
  /**
   * 鍵長を検証し、ラウンド鍵を生成する。
   * @param key AES-128 または AES-256 の生の鍵。
   * @returns 再利用できる AES。鍵が 16 または 32 バイトでなければ長さエラー。
   */
  create(key: Uint8Array): Result<Aes, "INVALID_KEY_LENGTH"> {
    if (
      key.length !== AesKeyLengths.Aes128 &&
      key.length !== AesKeyLengths.Aes256
    ) {
      return err("INVALID_KEY_LENGTH");
    }

    const roundKeys = expandRoundKeys(key);

    return ok<Aes>({
      decryptEcbBlock(ciphertext) {
        if (ciphertext.length !== AES_BLOCK_BYTES) {
          return err("INVALID_BLOCK_LENGTH");
        }

        const cipher = createBlockCipher(roundKeys);
        return ok(cipher.decrypt(ciphertext, 0));
      },

      decryptCbcBlocks(input) {
        const invalid = validateCbcInput(input);

        if (invalid.some) {
          return err(invalid.value);
        }

        return ok(decryptCbc(roundKeys, input));
      },

      encryptCbcBlocks(input) {
        const invalid = validateCbcInput(input);

        if (invalid.some) {
          return err(invalid.value);
        }

        return ok(encryptCbc(roundKeys, input));
      },

      decryptPdfCbc(input) {
        const hasIvAndCiphertext = input.length >= 2 * AES_BLOCK_BYTES;
        const aligned = input.length % AES_BLOCK_BYTES === 0;

        if (!hasIvAndCiphertext || !aligned) {
          return err("INVALID_LENGTH");
        }

        const iv = input.subarray(0, AES_BLOCK_BYTES);
        const data = input.subarray(AES_BLOCK_BYTES);
        return removePdfPadding(decryptCbc(roundKeys, { iv, data }));
      },
    });
  },
} as const;
