import type { PdfParseError } from "../../errors/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";

/**
 * zlib形式の圧縮データ（FlateDecode）を展開する。
 *
 * `DecompressionStream('deflate')` を使用してzlib展開を行う。
 * 純粋なzlib展開のみを行い、Predictor逆変換は呼び出し側の責務。
 *
 * @param data - zlib圧縮された入力バイト列
 * @returns 展開されたバイト列、または `FLATEDECODE_FAILED` エラー
 */
export async function decompressFlate(
  data: Uint8Array,
): Promise<Result<Uint8Array, PdfParseError>> {
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
      .write(data as Uint8Array<ArrayBuffer>)
      .then(() => writer.close())
      .catch((e: unknown) => {
        writeError = e;
        reader.cancel().catch(() => {});
      });

    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      totalLength += value.length;
    }

    await writePromise;

    if (writeError !== undefined) {
      return err({
        code: "FLATEDECODE_FAILED",
        message: "FlateDecode decompression failed during write",
      });
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return ok(result);
  } catch {
    return err({
      code: "FLATEDECODE_FAILED",
      message: "FlateDecode decompression failed",
    });
  }
}
