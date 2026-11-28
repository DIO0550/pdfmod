import type { ValueOf } from "../../../../utils/types/utility-type";

const BITS_PER_BYTE = 8n;
const PAD_START = 0x80;
const LOW_BIT_LENGTH_BYTES = 8;

/** MD5 の長さはリトルエンディアン、SHA-2 の長さはビッグエンディアン。 */
export const HashBlockLayouts = {
  Md5: { blockBytes: 64, lengthBytes: 8, littleEndian: true },
  Sha256: { blockBytes: 64, lengthBytes: 8, littleEndian: false },
  Sha512: { blockBytes: 128, lengthBytes: 16, littleEndian: false },
} as const;

type HashBlockLayout = ValueOf<typeof HashBlockLayouts>;

/**
 * 入力の完全なブロックと、パディングを付けた末尾を順に処理する。
 * @param input 入力バイト列。
 * @param layout ブロックサイズとメッセージ長の配置。
 * @param compress ブロックの先頭位置を受け取る圧縮処理。
 */
export function visitHashBlocks(
  input: Uint8Array,
  layout: HashBlockLayout,
  compress: (view: DataView, offset: number) => void,
): void {
  const { blockBytes, lengthBytes, littleEndian } = layout;
  const remaining = input.length % blockBytes;
  const tailStart = input.length - remaining;
  const source = new DataView(input.buffer, input.byteOffset, input.byteLength);

  for (let offset = 0; offset < tailStart; offset += blockBytes) {
    compress(source, offset);
  }

  const fitsInOneBlock = remaining + 1 + lengthBytes <= blockBytes;
  const tail = new Uint8Array(fitsInOneBlock ? blockBytes : 2 * blockBytes);
  tail.set(input.subarray(tailStart));
  tail[remaining] = PAD_START;

  // Uint8Array のビット長は 64 ビットに収まるため、128 ビット長の上位 64 ビットはゼロのまま。
  const padded = new DataView(tail.buffer);
  padded.setBigUint64(
    tail.length - LOW_BIT_LENGTH_BYTES,
    BigInt(input.length) * BITS_PER_BYTE,
    littleEndian,
  );

  for (let offset = 0; offset < tail.length; offset += blockBytes) {
    compress(padded, offset);
  }
}
