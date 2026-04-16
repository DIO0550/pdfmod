import type { PdfParseError } from "../../../errors/index";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import { TokenType } from "../../../types/index";
import { ObjectNumber } from "../../../types/object-number/index";
import { BufferedTokenizer } from "../buffered-tokenizer/index";

/**
 * indirect object (ISO 32000 7.3.10) の枠構造を扱うコンパニオンオブジェクト。
 */
export const IndirectObject = {
  /**
   * `N G obj` ヘッダを読み取り、objectNumber/generationNumber を返す。
   *
   * @param bt - バッファ付きトークナイザ
   * @param baseOffset - エラー報告用の基準オフセット
   * @returns objectNumber と generationNumber、またはエラー
   */
  parseHeader(
    bt: BufferedTokenizer,
    baseOffset: number,
  ): Result<
    { objectNumber: ObjectNumber; generationNumber: GenerationNumber },
    PdfParseError
  > {
    const objNumToken = bt.next();
    if (
      objNumToken.type !== TokenType.Integer ||
      Number.isNaN(objNumToken.value as number)
    ) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Expected object number (integer), got ${objNumToken.type}: ${String(objNumToken.value)}`,
        offset: ByteOffset.of(baseOffset + (objNumToken.offset as number)),
      });
    }

    const genNumToken = bt.next();
    if (
      genNumToken.type !== TokenType.Integer ||
      Number.isNaN(genNumToken.value as number)
    ) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Expected generation number (integer), got ${genNumToken.type}: ${String(genNumToken.value)}`,
        offset: ByteOffset.of(baseOffset + (genNumToken.offset as number)),
      });
    }

    const objKeyword = bt.next();
    if (objKeyword.type !== TokenType.Keyword || objKeyword.value !== "obj") {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Expected "obj" keyword, got ${objKeyword.type}: ${String(objKeyword.value)}`,
        offset: ByteOffset.of(baseOffset + (objKeyword.offset as number)),
      });
    }

    const objectNumberResult = ObjectNumber.create(objNumToken.value as number);
    if (!objectNumberResult.ok) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Invalid object number: ${objectNumberResult.error}`,
        offset: ByteOffset.of(baseOffset + (objNumToken.offset as number)),
      });
    }

    const generationNumberResult = GenerationNumber.create(
      genNumToken.value as number,
    );
    if (!generationNumberResult.ok) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Invalid generation number: ${generationNumberResult.error}`,
        offset: ByteOffset.of(baseOffset + (genNumToken.offset as number)),
      });
    }

    return ok({
      objectNumber: objectNumberResult.value,
      generationNumber: generationNumberResult.value,
    });
  },

  /**
   * 非 stream の本体後に `endobj` キーワードを期待する。
   *
   * @param bt - バッファ付きトークナイザ
   * @param baseOffset - エラー報告用の基準オフセット
   * @returns 成功時は void、失敗時はエラー
   */
  expectEndobj(
    bt: BufferedTokenizer,
    baseOffset: number,
  ): Result<void, PdfParseError> {
    const endobjToken = bt.next();
    if (
      endobjToken.type === TokenType.Keyword &&
      endobjToken.value === "endobj"
    ) {
      return ok(undefined);
    }
    if (endobjToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Expected endobj but reached EOF",
        offset: ByteOffset.of(baseOffset + (endobjToken.offset as number)),
      });
    }
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Expected "endobj", got ${String(endobjToken.value)}`,
      offset: ByteOffset.of(baseOffset + (endobjToken.offset as number)),
    });
  },

  /**
   * endstream 後の絶対位置から `endobj` キーワードを期待する。
   *
   * @param fullData - PDF ファイル全体のバイト配列
   * @param afterEndstreamAbsPos - endstream 後の絶対バイト位置
   * @returns 成功時は void、失敗時はエラー
   */
  expectEndobjAfter(
    fullData: Uint8Array,
    afterEndstreamAbsPos: ByteOffset,
  ): Result<void, PdfParseError> {
    const absPos = afterEndstreamAbsPos as number;
    const endobjBt = new BufferedTokenizer(
      new Tokenizer(fullData.subarray(absPos)),
    );
    const endobjToken = endobjBt.next();
    if (
      endobjToken.type === TokenType.Keyword &&
      endobjToken.value === "endobj"
    ) {
      return ok(undefined);
    }
    if (endobjToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Expected endobj after endstream but reached EOF",
        offset: afterEndstreamAbsPos,
      });
    }
    return err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Expected "endobj" after endstream, got ${String(endobjToken.value)}`,
      offset: ByteOffset.of(absPos + (endobjToken.offset as number)),
    });
  },
} as const;
