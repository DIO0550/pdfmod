import type { PdfParseError } from "../../../errors/index";
import { Tokenizer } from "../../../lexer/index";
import { NumberEx } from "../../../number-ex/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { ObjectNumber } from "../../../types/object-number/index";
import { TokenType } from "../../../types/pdf-types/index";

/** ObjStm ヘッダの1ペア（オブジェクト番号とオフセット） */
export interface ObjectStreamHeaderEntry {
  readonly objNum: ObjectNumber;
  readonly offset: ByteOffset;
}

/**
 * ObjStm ヘッダのパースを行うコンパニオンオブジェクト。
 */
export const ObjectStreamHeader = {
  /**
   * ObjStm のオフセットテーブルをパースする。
   * 展開済みデータの先頭 first バイトから N 組の (objNum, offset) ペアを
   * Tokenizer（ISO 32000-1 準拠の字句解析器）で読み取る。
   *
   * @param data - 展開済みストリームデータ
   * @param first - ヘッダ領域のバイト長（/First の値）
   * @param n - 読み取るペア数
   * @returns ヘッダペアの配列、またはエラー
   */
  parse(
    data: Uint8Array,
    first: number,
    n: number,
  ): Result<readonly ObjectStreamHeaderEntry[], PdfParseError> {
    if (!Number.isSafeInteger(first) || first < 0 || first > data.length) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `ObjStm header range is invalid: first=${first}, length=${data.length}`,
      });
    }

    if (!Number.isSafeInteger(n) || n < 0) {
      return err({
        code: "OBJECT_STREAM_HEADER_INVALID",
        message: `ObjStm header n is invalid: ${n}`,
      });
    }

    if (n === 0) {
      return ok([]);
    }

    const headerData = data.subarray(0, first);
    const tokenizer = new Tokenizer(headerData);
    const entries: ObjectStreamHeaderEntry[] = [];

    for (let i = 0; i < n; i++) {
      const objNumToken = tokenizer.nextToken();
      if (objNumToken.type !== TokenType.Integer) {
        return err({
          code: "OBJECT_STREAM_HEADER_INVALID",
          message: `Expected integer objNum at pair ${i}, got ${objNumToken.type}`,
        });
      }
      const objNumValue = objNumToken.value as number;
      if (!NumberEx.isSafeIntegerAtLeastZero(objNumValue)) {
        return err({
          code: "OBJECT_STREAM_HEADER_INVALID",
          message: `Invalid objNum in ObjStm header: ${objNumValue}`,
        });
      }

      const offsetToken = tokenizer.nextToken();
      if (offsetToken.type !== TokenType.Integer) {
        return err({
          code: "OBJECT_STREAM_HEADER_INVALID",
          message: `Expected integer offset at pair ${i}, got ${offsetToken.type}`,
        });
      }
      const offsetValue = offsetToken.value as number;
      if (!NumberEx.isSafeIntegerAtLeastZero(offsetValue)) {
        return err({
          code: "OBJECT_STREAM_HEADER_INVALID",
          message: `Invalid offset in ObjStm header: ${offsetValue}`,
        });
      }

      entries.push({
        objNum: ObjectNumber.of(objNumValue),
        offset: ByteOffset.of(offsetValue),
      });
    }

    return ok(entries);
  },
} as const;
