import type { PdfParseError } from "../../../errors/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { ByteOffset } from "../../../types/byte-offset/index";
import { ByteOffset as ByteOffsetNs } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import type { XRefEntry, XRefTable } from "../../../types/index";
import { ObjectNumber } from "../../../types/object-number/index";

const BYTE_BASE = 256;
const W_ARRAY_LENGTH = 3;
const MAX_FIELD_WIDTH = 8;

interface XRefStreamParams {
  readonly data: Uint8Array;
  readonly w: readonly [number, number, number];
  readonly size: number;
  readonly index?: readonly number[];
  readonly baseOffset?: ByteOffset;
}

/**
 * xrefストリーム固有のエラーを生成する。
 * @param message - エラーメッセージ
 * @param offset - PDFファイル内の絶対バイトオフセット（baseOffset + エントリ内位置）
 * @returns XREF_STREAM_INVALID エラーの Err
 */
function failXRefStream(
  message: string,
  offset?: ByteOffset,
): Result<never, PdfParseError> {
  return err({ code: "XREF_STREAM_INVALID", message, offset });
}

/**
 * ビッグエンディアン符号なし整数をデコードする。
 * @param data - バイト列
 * @param offset - 読み取り開始オフセット
 * @param width - フィールドのバイト幅（0の場合はデフォルト値0を返す）
 * @returns デコードされた整数値、またはオーバーフロー時にエラー
 */
function decodeIntBE(
  data: Uint8Array,
  offset: number,
  width: number,
): Result<number, PdfParseError> {
  if (width === 0) {
    return ok(0);
  }
  const value = data
    .subarray(offset, offset + width)
    .reduce((acc, byte) => acc * BYTE_BASE + byte, 0);
  if (value > Number.MAX_SAFE_INTEGER) {
    return failXRefStream("decoded integer exceeds safe integer range");
  }
  return ok(value);
}

/**
 * xrefストリームの1エントリをデコードする。
 * @param data - バイト列
 * @param offset - エントリの開始オフセット
 * @param w - /W配列 [typeWidth, field2Width, field3Width]
 * @returns デコードされたXRefEntry、またはエラー
 */
function decodeEntry(
  data: Uint8Array,
  offset: number,
  w: readonly [number, number, number],
  baseOffset: ByteOffset,
): Result<XRefEntry, PdfParseError> {
  const field2Start = offset + w[0];
  const field3Start = field2Start + w[1];
  const absTypeOffset = ByteOffsetNs.add(baseOffset, ByteOffsetNs.of(offset));
  const absField2Offset = ByteOffsetNs.add(
    baseOffset,
    ByteOffsetNs.of(field2Start),
  );
  const absField3Offset = ByteOffsetNs.add(
    baseOffset,
    ByteOffsetNs.of(field3Start),
  );

  const typeResult = decodeIntBE(data, offset, w[0]);
  if (!typeResult.ok) {
    return failXRefStream(
      "decoded integer exceeds safe integer range",
      absTypeOffset,
    );
  }

  const field2Result = decodeIntBE(data, field2Start, w[1]);
  if (!field2Result.ok) {
    return failXRefStream(
      "decoded integer exceeds safe integer range",
      absField2Offset,
    );
  }

  const field3Result = decodeIntBE(data, field3Start, w[2]);
  if (!field3Result.ok) {
    return failXRefStream(
      "decoded integer exceeds safe integer range",
      absField3Offset,
    );
  }

  const type = w[0] === 0 ? 1 : typeResult.value;
  const field2 = field2Result.value;
  const field3 = field3Result.value;

  switch (type) {
    case 0: {
      const objNumResult = ObjectNumber.create(field2);
      if (!objNumResult.ok) {
        return failXRefStream(objNumResult.error, absField2Offset);
      }
      const genResult = GenerationNumber.create(field3);
      if (!genResult.ok) {
        return failXRefStream(genResult.error, absField3Offset);
      }
      return ok({
        type: 0,
        nextFreeObject: objNumResult.value,
        generationNumber: genResult.value,
      });
    }
    case 1: {
      const offsetResult = ByteOffsetNs.create(field2);
      if (!offsetResult.ok) {
        return failXRefStream(offsetResult.error, absField2Offset);
      }
      const genResult = GenerationNumber.create(field3);
      if (!genResult.ok) {
        return failXRefStream(genResult.error, absField3Offset);
      }
      return ok({
        type: 1,
        offset: offsetResult.value,
        generationNumber: genResult.value,
      });
    }
    case 2: {
      const streamObjResult = ObjectNumber.create(field2);
      if (!streamObjResult.ok) {
        return failXRefStream(streamObjResult.error, absField2Offset);
      }
      if (!Number.isSafeInteger(field3) || field3 < 0) {
        return failXRefStream(
          `invalid indexInStream: ${field3}`,
          absField3Offset,
        );
      }
      return ok({
        type: 2,
        streamObject: streamObjResult.value,
        indexInStream: field3,
      });
    }
    default:
      return failXRefStream(`unknown xref entry type: ${type}`, absTypeOffset);
  }
}

/**
 * 解凍済みxrefストリームデータからXRefTableを構築する。
 * ストリームオブジェクト全体の解析（辞書パース・展開・/Type検証）は呼び出し側の責務。
 * @param params - xrefストリームデコードパラメータ
 * @param params.data - 解凍済みストリームバイト列
 * @param params.w - /W配列 [typeWidth, field2Width, field3Width]
 * @param params.size - /Size値（最大オブジェクト番号 + 1）
 * @param params.index - /Index配列（省略時は [0, size]）
 * @param params.baseOffset - ストリームのPDFファイル内開始オフセット（エラー報告用、省略時は0）
 * @returns XRefTable または PdfParseError
 */
export function decodeXRefStreamEntries(
  params: XRefStreamParams,
): Result<XRefTable, PdfParseError> {
  const { data, w, size } = params;

  if (w.length !== W_ARRAY_LENGTH) {
    return failXRefStream("/W array must have exactly 3 elements");
  }
  for (let i = 0; i < W_ARRAY_LENGTH; i++) {
    if (!Number.isSafeInteger(w[i]) || w[i] < 0) {
      return failXRefStream(
        "/W array element must be non-negative safe integer",
      );
    }
    if (w[i] > MAX_FIELD_WIDTH) {
      return failXRefStream(
        `/W field width ${w[i]} exceeds maximum ${MAX_FIELD_WIDTH} bytes`,
      );
    }
  }

  if (!Number.isSafeInteger(size) || size < 0) {
    return failXRefStream("invalid /Size value");
  }

  const entryWidth = w[0] + w[1] + w[2];
  if (!Number.isSafeInteger(entryWidth)) {
    return failXRefStream("entry width exceeds safe integer range");
  }

  const index = params.index ?? [0, size];
  if (index.length % 2 !== 0) {
    return failXRefStream("/Index array must have even number of elements");
  }

  const subsections: Array<{ firstObj: number; count: number }> = [];
  let totalEntries = 0;

  for (let i = 0; i < index.length; i += 2) {
    const firstObj = index[i];
    const count = index[i + 1];

    if (!Number.isSafeInteger(firstObj) || firstObj < 0) {
      return failXRefStream(
        "/Index firstObj must be non-negative safe integer",
      );
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      return failXRefStream("/Index count must be non-negative safe integer");
    }
    if (firstObj + count > size) {
      return failXRefStream("/Index range exceeds /Size");
    }

    subsections.push({ firstObj, count });
    totalEntries += count;

    if (!Number.isSafeInteger(totalEntries)) {
      return failXRefStream("total entry count exceeds safe integer range");
    }
  }

  if (entryWidth === 0 && totalEntries > 0) {
    return failXRefStream("entry width is 0 but total entries is non-zero");
  }

  const expectedBytes = totalEntries * entryWidth;
  if (!Number.isSafeInteger(expectedBytes)) {
    return failXRefStream("expected data length exceeds safe integer range");
  }
  if (data.length !== expectedBytes) {
    return failXRefStream(
      `stream data length mismatch: expected ${expectedBytes}, got ${data.length}`,
    );
  }

  const baseOffset = params.baseOffset ?? ByteOffsetNs.of(0);
  const entries = new Map<ObjectNumber, XRefEntry>();
  let dataOffset = 0;

  for (const { firstObj, count } of subsections) {
    for (let i = 0; i < count; i++) {
      const entryResult = decodeEntry(data, dataOffset, w, baseOffset);
      if (!entryResult.ok) {
        return entryResult;
      }

      const objNumResult = ObjectNumber.create(firstObj + i);
      if (!objNumResult.ok) {
        return failXRefStream(
          objNumResult.error,
          ByteOffsetNs.add(baseOffset, ByteOffsetNs.of(dataOffset)),
        );
      }

      entries.set(objNumResult.value, entryResult.value);
      dataOffset += entryWidth;
    }
  }

  return ok({ entries, size });
}
