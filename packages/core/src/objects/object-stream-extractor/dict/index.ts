import { NumberEx } from "../../../ext/number/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import { PdfFilter } from "../../../pdf/filter/index";
import { PdfType } from "../../../pdf/type/index";
import type { PdfValue } from "../../../pdf/types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

/** ObjStm 辞書バリデーション成功時の結果（内部型） */
export interface ObjectStreamDictInfo {
  readonly first: number;
  readonly n: number;
  readonly needsDecompress: boolean;
}

/**
 * ObjStm ストリーム辞書のバリデーションを行うコンパニオンオブジェクト。
 */
export const ObjectStreamDict = {
  /**
   * ObjStm ストリーム辞書をパースし、/First, /N, needsDecompress を取得する。
   * /Type, /N, /First, /Filter, /DecodeParms を検証する。
   *
   * 内部で呼び出す `PdfType.validate` / `PdfFilter.parse` 由来のエラーは
   * `OBJECT_STREAM_INVALID` に再ラップする（元の `message` / `offset` は保持）。
   *
   * @param entries - ストリーム辞書のエントリ
   * @returns パース済み辞書情報、または `OBJECT_STREAM_INVALID` エラー
   */
  parse(
    entries: Map<string, PdfValue>,
  ): Result<ObjectStreamDictInfo, PdfParseError> {
    const typeError = PdfType.validate(entries, "ObjStm");
    if (typeError.some) {
      return err({ ...typeError.value, code: "OBJECT_STREAM_INVALID" });
    }

    const firstEntry = entries.get("First");
    if (firstEntry === undefined) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm dictionary missing /First",
      });
    }
    if (firstEntry.type !== "integer") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm /First must be an integer",
      });
    }
    if (!NumberEx.isSafeIntegerAtLeastZero(firstEntry.value)) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm /First must be a non-negative safe integer, got ${firstEntry.value}`,
      });
    }

    const nEntry = entries.get("N");
    if (nEntry === undefined) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm dictionary missing /N",
      });
    }
    if (nEntry.type !== "integer") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm /N must be an integer",
      });
    }
    if (!NumberEx.isSafeIntegerAtLeastZero(nEntry.value)) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `ObjStm /N must be a non-negative safe integer, got ${nEntry.value}`,
      });
    }

    const minBytesPerPair = 4;
    const maxObjectStreamPairs = 100_000;
    const maxNByFirst =
      firstEntry.value === 0
        ? 0
        : Math.floor((firstEntry.value + 1) / minBytesPerPair);
    const maxN = Math.min(maxNByFirst, maxObjectStreamPairs);
    if (nEntry.value > maxN) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message:
          maxNByFirst > maxObjectStreamPairs
            ? `ObjStm /N (${nEntry.value}) exceeds hard limit (${maxObjectStreamPairs})`
            : `ObjStm /N (${nEntry.value}) exceeds maximum possible pairs for /First (${firstEntry.value})`,
      });
    }

    const extendsEntry = entries.get("Extends");
    if (extendsEntry !== undefined) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm with /Extends is not supported in current scope",
      });
    }

    const decodeParmsEntry = entries.get("DecodeParms");
    if (decodeParmsEntry !== undefined) {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "ObjStm with /DecodeParms is not supported in current scope",
      });
    }

    const filterResult = PdfFilter.parse(entries);
    if (!filterResult.ok) {
      return err({ ...filterResult.error, code: "OBJECT_STREAM_INVALID" });
    }

    return ok({
      first: firstEntry.value,
      n: nEntry.value,
      needsDecompress: filterResult.value !== undefined,
    });
  },
} as const;
