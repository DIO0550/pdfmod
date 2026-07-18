const BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;
const UINT16_MASK = 0xffff;
const UINT16_BYTE_LENGTH = 2;
const ZLIB_CMF_DEFLATE_32K_WINDOW = 0x78;
const ZLIB_FLG_DEFAULT_LEVEL = 0x9c;
const ZLIB_HEADER: readonly number[] = [
  ZLIB_CMF_DEFLATE_32K_WINDOW,
  ZLIB_FLG_DEFAULT_LEVEL,
];
const STORED_BLOCK_MAX_LENGTH = UINT16_MASK;
const STORED_BLOCK_CONTROL_BYTES = 1;
const STORED_BLOCK_HEADER_BYTES =
  STORED_BLOCK_CONTROL_BYTES + UINT16_BYTE_LENGTH * 2;
const ADLER32_TRAILER_BYTES = 4;
const ADLER32_MODULO = 65521;
const ADLER32_B_SHIFT = 16;

/**
 * 16bit値をリトルエンディアンで書き込む。
 *
 * @param target - 書き込み先バイト列
 * @param offset - 書き込み開始位置
 * @param value - 書き込む16bit値
 */
function writeUint16LE(
  target: Uint8Array,
  offset: number,
  value: number,
): void {
  target[offset] = value & BYTE_MASK;
  target[offset + 1] = (value >> BITS_PER_BYTE) & BYTE_MASK;
}

/**
 * Adler-32チェックサムを計算する（zlibトレーラー用）。
 *
 * @param data - チェックサム対象のバイト列
 * @returns Adler-32チェックサム値
 */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % ADLER32_MODULO;
    b = (b + a) % ADLER32_MODULO;
  }
  return ((b << ADLER32_B_SHIFT) | a) >>> 0;
}

/**
 * 非圧縮（stored）DEFLATEブロックのみで構成される正当なzlibストリームを組み立てる。
 * サイズ上限テスト用の巨大なペイロードをソースコードへ literal 配列として
 * 埋め込まずに実行時生成するためのテストヘルパー。
 *
 * @param payload - 展開後データとして復元されるべき元バイト列
 * @returns zlib形式（RFC 1950）の圧縮バイト列
 */
export function buildStoredZlib(payload: Uint8Array): Uint8Array {
  const blockCount = Math.max(
    1,
    Math.ceil(payload.length / STORED_BLOCK_MAX_LENGTH),
  );
  const totalSize =
    ZLIB_HEADER.length +
    blockCount * STORED_BLOCK_HEADER_BYTES +
    payload.length +
    ADLER32_TRAILER_BYTES;

  const output = new Uint8Array(totalSize);
  output.set(ZLIB_HEADER, 0);

  let writeOffset = ZLIB_HEADER.length;
  let readOffset = 0;
  for (let i = 0; i < blockCount; i++) {
    const chunkLength = Math.min(
      STORED_BLOCK_MAX_LENGTH,
      payload.length - readOffset,
    );
    const isFinalBlock = i === blockCount - 1;
    const complement = ~chunkLength & UINT16_MASK;

    output[writeOffset] = isFinalBlock ? 1 : 0;
    writeUint16LE(
      output,
      writeOffset + STORED_BLOCK_CONTROL_BYTES,
      chunkLength,
    );
    writeUint16LE(
      output,
      writeOffset + STORED_BLOCK_CONTROL_BYTES + UINT16_BYTE_LENGTH,
      complement,
    );
    writeOffset += STORED_BLOCK_HEADER_BYTES;

    output.set(
      payload.subarray(readOffset, readOffset + chunkLength),
      writeOffset,
    );
    writeOffset += chunkLength;
    readOffset += chunkLength;
  }

  const checksum = adler32(payload);
  for (let byteIndex = 0; byteIndex < ADLER32_TRAILER_BYTES; byteIndex++) {
    const shift = (ADLER32_TRAILER_BYTES - 1 - byteIndex) * BITS_PER_BYTE;
    output[writeOffset + byteIndex] = (checksum >>> shift) & BYTE_MASK;
  }

  return output;
}
