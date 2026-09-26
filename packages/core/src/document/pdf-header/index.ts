import { Uint8ArrayEx } from "../../ext/uint8-array/index";
import { isPdfWhitespace } from "../../lexer/bytes/index";
import type { PdfParseError } from "../../pdf/errors/index";
import { ByteOffset } from "../../pdf/types/index";
import { PdfVersion } from "../../pdf/version/index";
import { err, ok, type Result } from "../../utils/result/index";

const PDF_HEADER_SIGNATURE: readonly number[] = Array.from(
  new TextEncoder().encode("%PDF-"),
);

// PDF仕様上の規定ではなく、Adobe実装ノートで一般的に使われる慣行値。
const HEADER_SCAN_LIMIT = 1024;
const VERSION_MAX_LEN = 8;

/**
 * version 文字列の終端位置を返す。
 * `versionStart` から最大 `VERSION_MAX_LEN` バイト以内で、
 * 最初に現れる PDF whitespace の位置 (見つからなければ走査上限) を返す。
 *
 * @param data - PDF のバイト列
 * @param versionStart - signature 直後の version 文字列開始位置
 * @returns version 文字列の終端 (whitespace の位置、または走査上限)
 */
const findVersionEnd = (data: Uint8Array, versionStart: number): number => {
  const scanLimit = Math.min(data.length, versionStart + VERSION_MAX_LEN);
  for (let i = versionStart; i < scanLimit; i++) {
    if (isPdfWhitespace(data[i])) {
      return i;
    }
  }
  return scanLimit;
};

/**
 * PDF ヘッダを表すモデル。
 * ISO 32000-1 §7.5.2 に基づき、バージョンとファイル内の開始オフセットを保持する。
 */
export interface PdfHeader {
  readonly version: PdfVersion;
  readonly offset: ByteOffset;
}

export const PdfHeader = {
  /**
   * PDF バイト列の先頭 1024 バイト以内から `%PDF-x.y` ヘッダを走査・検証して `PdfHeader` を返す。
   *
   * @param data - PDF のバイト列
   * @returns 成功時は `Ok<PdfHeader>`、不正時は `Err<PdfParseError>`
   */
  parse(data: Uint8Array): Result<PdfHeader, PdfParseError> {
    if (data.length < PDF_HEADER_SIGNATURE.length) {
      return err({
        code: "INVALID_HEADER",
        message: "PDF data too short to contain %PDF- header",
        offset: ByteOffset.of(0),
      });
    }

    const headerOffsetOpt = Uint8ArrayEx.indexOf(
      data,
      PDF_HEADER_SIGNATURE,
      0,
      HEADER_SCAN_LIMIT,
    );
    if (!headerOffsetOpt.some) {
      return err({
        code: "INVALID_HEADER",
        message: `%PDF- signature not found in first ${HEADER_SCAN_LIMIT} bytes`,
        offset: ByteOffset.of(0),
      });
    }

    const headerOffset = headerOffsetOpt.value;
    const versionStart = headerOffset + PDF_HEADER_SIGNATURE.length;
    const versionEnd = findVersionEnd(data, versionStart);
    const versionStr = new TextDecoder("ascii").decode(
      data.subarray(versionStart, versionEnd),
    );

    const created = PdfVersion.create(versionStr);
    if (!created.ok) {
      return err({
        code: "INVALID_HEADER",
        message: `Invalid PDF version "${versionStr}": ${created.error}`,
        offset: ByteOffset.of(versionStart),
      });
    }

    return ok({
      version: created.value,
      offset: ByteOffset.of(headerOffset),
    });
  },
} as const;
