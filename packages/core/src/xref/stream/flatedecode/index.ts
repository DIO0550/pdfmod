import type { PdfParseError } from "../../../errors/index";
import { NumberEx } from "../../../number-ex/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";

const DEFAULT_MAX_DECOMPRESSED_MB = 100;
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const DEFAULT_MAX_DECOMPRESSED_SIZE =
  DEFAULT_MAX_DECOMPRESSED_MB * BYTES_PER_MB;

/**
 * zlib形式の圧縮データ（FlateDecode）を展開する。
 *
 * `DecompressionStream('deflate')` を使用してzlib展開を行う。
 * 純粋なzlib展開のみを行い、Predictor逆変換は呼び出し側の責務。
 *
 * @param data - zlib圧縮された入力バイト列
 * @param maxDecompressedSize - 展開後の最大バイト数（デフォルト: 100MB）。超過時はエラーを返す
 * @returns 展開されたバイト列、または `FLATEDECODE_FAILED` エラー
 */
export async function decompressFlate(
  data: Uint8Array,
  maxDecompressedSize: number = DEFAULT_MAX_DECOMPRESSED_SIZE,
): Promise<Result<Uint8Array, PdfParseError>> {
  if (!NumberEx.isPositiveSafeInteger(maxDecompressedSize)) {
    return err({
      code: "FLATEDECODE_FAILED",
      message:
        "Invalid maxDecompressedSize: must be a finite, positive safe integer",
    });
  }

  if (data.length === 0) {
    return err({
      code: "FLATEDECODE_FAILED",
      message: "Empty input data cannot be a valid zlib payload",
    });
  }

  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    const { promise, hasWriteError } = writeData(writer, reader, data);
    const readResult = await readAllChunks(reader, writer, maxDecompressedSize);
    if (!readResult.ok) {
      return readResult;
    }

    await promise;

    if (hasWriteError()) {
      return err({
        code: "FLATEDECODE_FAILED",
        message: "FlateDecode decompression failed during write",
      });
    }

    return ok(readResult.value);
  } catch {
    return err({
      code: "FLATEDECODE_FAILED",
      message: "FlateDecode decompression failed",
    });
  }
}

/**
 * ストリームから全チャンクを読み取り、バッファに結合して返す。
 * サイズ超過時はストリームを中断し Err を返す。
 *
 * @param reader - 読み取りストリームリーダー
 * @param writer - 書き込みストリームライター（サイズ超過時の中断用）
 * @param maxDecompressedSize - 展開後の最大バイト数
 * @returns 結合済みバイト列、またはサイズ超過エラー
 */
async function readAllChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter,
  maxDecompressedSize: number,
): Promise<Result<Uint8Array, PdfParseError>> {
  let buffer = new Uint8Array(
    maxDecompressedSize < BYTES_PER_MB ? maxDecompressedSize : BYTES_PER_MB,
  );
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalLength += value.length;

    if (totalLength > maxDecompressedSize) {
      await abortStreams(reader, writer);
      return err({
        code: "FLATEDECODE_FAILED",
        message: `Decompressed size exceeds limit of ${maxDecompressedSize} bytes`,
      });
    }

    if (totalLength > buffer.length) {
      const next = new Uint8Array(
        Math.min(Math.max(totalLength, buffer.length * 2), maxDecompressedSize),
      );
      next.set(buffer.subarray(0, totalLength - value.length));
      buffer = next;
    }

    buffer.set(value, totalLength - value.length);
  }

  return ok(buffer.subarray(0, totalLength));
}

/**
 * 圧縮データをストリームに書き込み、完了後にクローズする。
 * 書き込みエラー発生時は reader をキャンセルし、エラー状態をクロージャに保持する。
 *
 * @param writer - 書き込みストリームライター
 * @param reader - 読み取りストリームリーダー（エラー時キャンセル用）
 * @param data - 書き込む圧縮データ
 * @returns promise と hasWriteError 関数を持つオブジェクト
 */
function writeData(
  writer: WritableStreamDefaultWriter,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  data: Uint8Array,
): { promise: Promise<void>; hasWriteError: () => boolean } {
  let writeError: unknown;

  const promise = writer
    // TODO: lib に ES2024 を追加すれば Uint8Array → BufferSource の互換が解消されキャスト不要になる
    .write(data as unknown as BufferSource)
    .then(() => writer.close())
    .catch((e: unknown) => {
      writeError = e;
      reader.cancel().catch(() => {});
    });

  return { promise, hasWriteError: () => writeError !== undefined };
}

/**
 * reader と writer のストリームを安全に中断する。
 *
 * @param reader - 読み取りストリームリーダー
 * @param writer - 書き込みストリームライター
 * @returns ストリーム中断完了後に解決する Promise
 */
async function abortStreams(
  reader: ReadableStreamDefaultReader,
  writer: WritableStreamDefaultWriter,
): Promise<void> {
  await reader.cancel().catch(() => {});
  await writer.abort().catch(() => {});
}
