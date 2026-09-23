import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import type { PdfParseError } from "../errors/index";
import type { PdfValue } from "../types/pdf-types/index";
import { decompressFlate } from "./flatedecode/index";

export { decompressFlate } from "./flatedecode/index";

/** フィルタデコードのオプション。 */
export interface FilterDecodeOptions {
  /** 展開後の最大バイト数（未指定時は各デコーダのデフォルト）。 */
  readonly maxDecompressedSize?: number;
}

const SUPPORTED_FILTER_NAME = "FlateDecode";

/** PDF ストリーム辞書の /Filter エントリのパースおよび展開パイプラインを提供するコンパニオンオブジェクト。 */
export const PdfFilter = {
  /**
   * /Filter エントリを検証し、フィルタ名を返す。
   * 単一 name（例: `/FlateDecode`）および単一要素 array（例: `[/FlateDecode]`）を受理する。
   * 未指定時は `undefined`、サポート外フィルタ・型不正時は `PDF_FILTER_UNSUPPORTED` エラーを返す。
   *
   * @param entries - ストリーム辞書のエントリ
   * @returns フィルタ名（未指定時は undefined）、または `PDF_FILTER_UNSUPPORTED` エラー
   */
  parse(
    entries: Map<string, PdfValue>,
  ): Result<string | undefined, PdfParseError> {
    const entry = entries.get("Filter");
    if (entry === undefined) {
      return ok(undefined);
    }

    let target = entry;
    if (entry.type === "array") {
      if (entry.elements.length !== 1) {
        return err({
          code: "PDF_FILTER_UNSUPPORTED",
          message: `/Filter array with ${String(entry.elements.length)} filters is not supported`,
        });
      }
      const first = entry.elements[0];
      if (first === undefined) {
        return err({
          code: "PDF_FILTER_UNSUPPORTED",
          message: "/Filter array element is missing",
        });
      }
      target = first;
    }

    if (target.type !== "name") {
      return err({
        code: "PDF_FILTER_UNSUPPORTED",
        message: `/Filter must be a name, got ${target.type}`,
      });
    }

    if (target.value !== SUPPORTED_FILTER_NAME) {
      return err({
        code: "PDF_FILTER_UNSUPPORTED",
        message: `/Filter /${target.value} is not supported`,
      });
    }

    return ok(target.value);
  },

  /**
   * フィルタ指定に基づきバイト列を展開するパイプライン。
   * `filter` が未指定（`undefined`）の場合はデータを無変換で返す。
   *
   * @param data - 入力バイト列
   * @param filter - 適用するフィルタ名（単一文字列または未指定）
   * @param options - デコードオプション
   * @returns 展開されたバイト列、またはエラー
   */
  async decode(
    data: Uint8Array,
    filter: string | undefined,
    options?: FilterDecodeOptions,
  ): Promise<Result<Uint8Array, PdfParseError>> {
    if (filter === undefined) {
      return ok(data);
    }

    if (filter === SUPPORTED_FILTER_NAME) {
      return decompressFlate(data, options?.maxDecompressedSize);
    }

    return err({
      code: "PDF_FILTER_UNSUPPORTED",
      message: `/Filter /${filter} is not supported`,
    });
  },
} as const;
