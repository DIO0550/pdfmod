import type { PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";

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
  if (
    !Number.isFinite(maxDecompressedSize) ||
    !Number.isSafeInteger(maxDecompressedSize) ||
    maxDecompressedSize <= 0
  ) {
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

    let writeError: unknown;
    const writePromise = writer
      .write(data as unknown as BufferSource)
      .then(() => writer.close())
      .catch((e: unknown) => {
        writeError = e;
        reader.cancel().catch(() => {});
      });

    let result = new Uint8Array(
      maxDecompressedSize < BYTES_PER_MB ? maxDecompressedSize : BYTES_PER_MB,
    );
    let totalLength = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalLength += value.length;
      if (totalLength > maxDecompressedSize) {
        await reader.cancel().catch(() => {});
        await writer.abort().catch(() => {});
        return err({
          code: "FLATEDECODE_FAILED",
          message: `Decompressed size exceeds limit of ${maxDecompressedSize} bytes`,
        });
      }
      if (totalLength > result.length) {
        const previousLength = totalLength - value.length;
        const next = new Uint8Array(
          Math.min(result.length * 2, maxDecompressedSize),
        );
        next.set(result.subarray(0, previousLength));
        result = next;
      }
      result.set(value, totalLength - value.length);
    }

    await writePromise;

    if (writeError !== undefined) {
      return err({
        code: "FLATEDECODE_FAILED",
        message: "FlateDecode decompression failed during write",
      });
    }

    return ok(result.subarray(0, totalLength));
  } catch {
    return err({
      code: "FLATEDECODE_FAILED",
      message: "FlateDecode decompression failed",
    });
  }
}
