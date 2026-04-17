import type { PdfParseError } from "../../../errors/index";
import { NumberEx } from "../../../ext/number/index";
import { PdfFilter } from "../../../pdf-filter/index";
import { PdfType } from "../../../pdf-type/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { PdfValue } from "../../../types/pdf-types/index";

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
   * ObjStm ストリーム辞書をバリデーションする。
   * /Type, /N, /First, /Filter, /DecodeParms を検証する。
   *
   * @param entries - ストリーム辞書のエントリ
   * @returns バリデーション済み辞書情報、またはエラー
   */
  validate(
    entries: Map<string, PdfValue>,
  ): Result<ObjectStreamDictInfo, PdfParseError> {
    const typeResult = PdfType.validate(
      entries,
      "ObjStm",
      "OBJECT_STREAM_INVALID",
    );
    if (!typeResult.ok) {
      return typeResult;
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

    const filterResult = PdfFilter.validate(entries);
    if (!filterResult.ok) {
      return filterResult;
    }

    return ok({
      first: firstEntry.value,
      n: nEntry.value,
      needsDecompress: filterResult.value !== undefined,
    });
  },
} as const;
