import type { PdfError, PdfParseError } from "../../../errors/index";
import { NumberEx } from "../../../ext/number/index";
import { isPdfTokenBoundary } from "../../../lexer/bytes/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { ObjectNumber } from "../../../types/object-number/index";
import type { PdfDictionary } from "../../../types/pdf-types/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type {
  ObjectResolver,
  StreamExtractResult,
  StreamLength,
} from "../types";

const LF = 0x0a;
const CR = 0x0d;
const ENDSTREAM_KEYWORD = "endstream";

/**
 * stream object (ISO 32000 7.3.8) を扱うコンパニオンオブジェクト。
 */
export const StreamObject = {
  /**
   * 辞書の /Length エントリを型付きで読み取る（sync、pure）。
   * indirect-ref の場合はそのまま indirect として返し、解決はしない。
   *
   * @param dict - ストリーム辞書
   * @param baseOffset - エラー報告用の基準オフセット
   * @param relPos - エラー報告用の相対位置
   * @returns StreamLength、またはエラー
   */
  readLength(
    dict: PdfDictionary,
    baseOffset: ByteOffset,
    relPos: number,
  ): Result<StreamLength, PdfParseError> {
    const lengthObj = dict.entries.get("Length");
    if (lengthObj === undefined) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: "/Length entry is missing from stream dictionary",
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }
    if (lengthObj.type === "integer") {
      return ok({ kind: "direct", value: lengthObj.value });
    }
    if (lengthObj.type === "indirect-ref") {
      return ok({ kind: "indirect", ref: lengthObj });
    }
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `/Length has unexpected type: ${lengthObj.type}`,
      offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
    });
  },

  /**
   * StreamLength を integer に解決する（async）。
   * kind が direct なら即返却、indirect なら resolver で参照先を取得して integer に narrow する。
   *
   * @param length - StreamLength
   * @param baseOffset - エラー報告用の基準オフセット
   * @param relPos - エラー報告用の相対位置
   * @param resolver - indirect-ref 解決コールバック（省略時はエラー）
   * @returns 長さ値、またはエラー
   */
  async resolveLength(
    length: StreamLength,
    baseOffset: ByteOffset,
    relPos: number,
    resolver?: ObjectResolver,
  ): Promise<Result<number, PdfError>> {
    if (length.kind === "direct") {
      return ok(length.value);
    }
    if (resolver === undefined) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message:
          "/Length is an indirect reference but resolver was not provided",
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }
    const objectNumber = ObjectNumber.create(length.ref.objectNumber);
    if (!objectNumber.ok) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length indirect reference has invalid object number: ${objectNumber.error}`,
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }
    const generationNumber = GenerationNumber.create(
      length.ref.generationNumber,
    );
    if (!generationNumber.ok) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length indirect reference has invalid generation number: ${generationNumber.error}`,
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }
    const resolved = await resolver(objectNumber.value, generationNumber.value);
    if (!resolved.ok) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length indirect reference resolution failed: ${resolved.error.message}`,
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }
    if (resolved.value.type !== "integer") {
      return err({
        code: "TYPE_MISMATCH" as const,
        message: "/Length indirect reference resolved to unexpected type",
        expected: "integer",
        actual: resolved.value.type,
      });
    }
    return ok(resolved.value.value);
  },

  /**
   * stream キーワード後の改行を検証し、ストリームデータを切り出す。
   *
   * @param fullData - PDF ファイル全体のバイト配列
   * @param baseOffset - parse/parseIndirectObject に渡された offset
   * @param relPos - Tokenizer の現在位置（subData 基準）
   * @param dict - ストリーム辞書
   * @param length - ストリームデータ長
   * @returns PdfStream と endstream 後の絶対位置、またはエラー
   */
  extract(
    fullData: Uint8Array,
    baseOffset: ByteOffset,
    relPos: number,
    dict: PdfDictionary,
    length: number,
  ): Result<StreamExtractResult, PdfParseError> {
    if (!NumberEx.isSafeIntegerAtLeastZero(length)) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length value is invalid: ${length}`,
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }

    const absPos = (baseOffset as number) + relPos;
    let streamStart: number;

    if (fullData[absPos] === LF) {
      streamStart = absPos + 1;
    } else if (fullData[absPos] === CR) {
      if (fullData[absPos + 1] === LF) {
        streamStart = absPos + 2;
      } else {
        return err({
          code: "OBJECT_PARSE_STREAM_LENGTH",
          message:
            "stream keyword must be followed by LF or CRLF, got CR alone",
          offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
        });
      }
    } else {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: "stream keyword must be followed by LF or CRLF",
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }

    if (streamStart + length > fullData.length) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length ${length} exceeds available data`,
        offset: ByteOffset.add(baseOffset, ByteOffset.of(relPos)),
      });
    }

    const streamData = fullData.subarray(streamStart, streamStart + length);

    const afterStreamPos = streamStart + length;
    let endstreamPos: number;
    if (fullData[afterStreamPos] === LF) {
      endstreamPos = afterStreamPos + 1;
    } else if (
      fullData[afterStreamPos] === CR &&
      fullData[afterStreamPos + 1] === LF
    ) {
      endstreamPos = afterStreamPos + 2;
    } else {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: 'Expected LF or CRLF before "endstream"',
        offset: ByteOffset.of(afterStreamPos),
      });
    }

    if (!matchesAsciiAt(fullData, endstreamPos, ENDSTREAM_KEYWORD)) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message:
          'Expected "endstream" immediately after stream data terminator',
        offset: ByteOffset.of(endstreamPos),
      });
    }

    const afterEndstreamAbsPos = ByteOffset.of(
      endstreamPos + ENDSTREAM_KEYWORD.length,
    );
    const nextByte = fullData[afterEndstreamAbsPos as number];
    if (nextByte !== undefined && !isPdfTokenBoundary(nextByte)) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: '"endstream" must be followed by a token boundary',
        offset: afterEndstreamAbsPos,
      });
    }
    return ok({
      object: { type: "stream", dictionary: dict, data: streamData },
      afterEndstreamAbsPos,
    });
  },
} as const;

/**
 * data の start 位置から text と一致する ASCII バイト列があるか判定する。
 *
 * @param data - 検査対象のバイト配列
 * @param start - 比較開始位置
 * @param text - ASCII 文字列
 * @returns 完全一致すれば true
 */
function matchesAsciiAt(
  data: Uint8Array,
  start: number,
  text: string,
): boolean {
  if (start < 0 || start + text.length > data.length) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    if (data[start + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}
