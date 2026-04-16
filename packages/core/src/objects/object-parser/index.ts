import type { PdfError, PdfParseError } from "../../errors/index";
import { Tokenizer } from "../../lexer/tokenizer/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { TokenType } from "../../types/index";
import type { PdfIndirectObject, PdfObject } from "../../types/pdf-types/index";
import { BufferedTokenizer } from "./buffered-tokenizer/index";
import { DirectObject } from "./direct-object/index";
import { IndirectObject } from "./indirect-object/index";
import { StreamObject } from "./stream-object/index";
import type { ObjectResolver } from "./types";

export type { ObjectResolver } from "./types";

/**
 * offset が非負 safe integer かつ data.length 未満であることを検証する。
 * `ByteOffset.of()` は unchecked cast のため、runtime ガードが引き続き必要。
 *
 * @param data - パース対象のバイト配列
 * @param offset - 検証対象のオフセット
 * @returns 検証済みの ByteOffset、または検証エラー
 */
function validateOffset(
  data: Uint8Array,
  offset: ByteOffset,
): Result<ByteOffset, PdfParseError> {
  const n = offset as number;
  if (!Number.isSafeInteger(n) || n < 0) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Offset ${n} is invalid; expected a non-negative safe integer within [0, ${data.length})`,
      offset: ByteOffset.of(0),
    });
  }
  if (n >= data.length) {
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Offset ${n} is out of range [0, ${data.length})`,
      offset: ByteOffset.of(n),
    });
  }
  return ok(offset);
}

export const ObjectParser = {
  /**
   * data の offset 位置から PdfObject を1つパースする。
   * 辞書直後に stream キーワードが存在する場合は stream オブジェクトとして返す。
   * ただし /Length が間接参照の場合は OBJECT_PARSE_STREAM_LENGTH エラーを返す。
   *
   * @param data - PDF バイト配列
   * @param offset - data に対する相対位置
   * @returns パースされた PdfObject、またはエラー
   */
  parse(
    data: Uint8Array,
    offset: ByteOffset,
  ): Result<PdfObject, PdfParseError> {
    const offsetResult = validateOffset(data, offset);
    if (!offsetResult.ok) {
      return offsetResult;
    }
    const baseOffset = offsetResult.value;

    const subData = data.subarray(baseOffset as number);
    const bt = new BufferedTokenizer(new Tokenizer(subData));
    const result = DirectObject.parse(bt, baseOffset, 0);
    if (!result.ok) {
      return result;
    }

    if (result.value.type === "dictionary") {
      const peekToken = bt.next();
      if (
        peekToken.type === TokenType.Keyword &&
        peekToken.value === "stream"
      ) {
        const lengthResult = StreamObject.readLength(
          result.value,
          baseOffset,
          bt.position,
        );
        if (!lengthResult.ok) {
          return lengthResult;
        }
        if (lengthResult.value.kind === "indirect") {
          return err({
            code: "OBJECT_PARSE_STREAM_LENGTH",
            message:
              "/Length is an indirect reference; use parseIndirectObject for indirect /Length resolution",
            offset: ByteOffset.add(baseOffset, ByteOffset.of(bt.position)),
          });
        }
        const streamResult = StreamObject.extract(
          data,
          baseOffset,
          bt.position,
          result.value,
          lengthResult.value.value,
        );
        if (!streamResult.ok) {
          return streamResult;
        }
        return ok(streamResult.value.object);
      }
      bt.pushBack(peekToken);
    }

    return ok(result.value);
  },

  /**
   * data の offset 位置から間接オブジェクト定義 (N G obj ... endobj) をパースする。
   *
   * @param data - PDF バイト配列
   * @param offset - data に対する相対位置
   * @param resolver - /Length が間接参照の場合の解決コールバック
   * @returns パースされた PdfIndirectObject、またはエラー
   */
  async parseIndirectObject(
    data: Uint8Array,
    offset: ByteOffset,
    resolver?: ObjectResolver,
  ): Promise<Result<PdfIndirectObject, PdfError>> {
    const offsetResult = validateOffset(data, offset);
    if (!offsetResult.ok) {
      return offsetResult;
    }
    const baseOffset = offsetResult.value;

    const subData = data.subarray(baseOffset as number);
    const bt = new BufferedTokenizer(new Tokenizer(subData));

    const headerResult = IndirectObject.parseHeader(bt, baseOffset);
    if (!headerResult.ok) {
      return headerResult;
    }
    const { objectNumber, generationNumber } = headerResult.value;

    const bodyResult = DirectObject.parse(bt, baseOffset, 0);
    if (!bodyResult.ok) {
      return bodyResult;
    }

    const value = bodyResult.value;

    if (value.type === "dictionary") {
      const peekToken = bt.next();
      if (
        peekToken.type === TokenType.Keyword &&
        peekToken.value === "stream"
      ) {
        const lengthTyped = StreamObject.readLength(
          value,
          baseOffset,
          bt.position,
        );
        if (!lengthTyped.ok) {
          return lengthTyped;
        }
        const lengthResolved = await StreamObject.resolveLength(
          lengthTyped.value,
          baseOffset,
          bt.position,
          resolver,
        );
        if (!lengthResolved.ok) {
          return lengthResolved;
        }
        const streamResult = StreamObject.extract(
          data,
          baseOffset,
          bt.position,
          value,
          lengthResolved.value,
        );
        if (!streamResult.ok) {
          return streamResult;
        }
        const endobjResult = IndirectObject.expectEndobjAfter(
          data,
          streamResult.value.afterEndstreamAbsPos,
        );
        if (!endobjResult.ok) {
          return endobjResult;
        }
        return ok({
          objectNumber,
          generationNumber,
          body: streamResult.value.object,
        });
      }
      bt.pushBack(peekToken);
    }

    const endobjResult = IndirectObject.expectEndobj(bt, baseOffset);
    if (!endobjResult.ok) {
      return endobjResult;
    }
    return ok({ objectNumber, generationNumber, body: value });
  },
} as const;
