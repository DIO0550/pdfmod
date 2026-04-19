import { Tokenizer } from "../../../lexer/tokenizer/index";
import type { PdfParseError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { TokenType } from "../../../pdf/types/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { Option } from "../../../utils/option/index";
import { none, some } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
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
    baseOffset: ByteOffset,
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
        offset: ByteOffset.add(baseOffset, objNumToken.offset),
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
        offset: ByteOffset.add(baseOffset, genNumToken.offset),
      });
    }

    const objKeyword = bt.next();
    if (objKeyword.type !== TokenType.Keyword || objKeyword.value !== "obj") {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Expected "obj" keyword, got ${objKeyword.type}: ${String(objKeyword.value)}`,
        offset: ByteOffset.add(baseOffset, objKeyword.offset),
      });
    }

    const objectNumberResult = ObjectNumber.create(objNumToken.value as number);
    if (!objectNumberResult.ok) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Invalid object number: ${objectNumberResult.error}`,
        offset: ByteOffset.add(baseOffset, objNumToken.offset),
      });
    }

    const generationNumberResult = GenerationNumber.create(
      genNumToken.value as number,
    );
    if (!generationNumberResult.ok) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Invalid generation number: ${generationNumberResult.error}`,
        offset: ByteOffset.add(baseOffset, genNumToken.offset),
      });
    }

    return ok({
      objectNumber: objectNumberResult.value,
      generationNumber: generationNumberResult.value,
    });
  },

  /**
   * 非 stream の本体後に `endobj` キーワードを検査する。
   *
   * @param bt - バッファ付きトークナイザ
   * @param baseOffset - エラー報告用の基準オフセット
   * @returns endobj 一致時は `none`、不一致・EOF 時は `some(PdfParseError)`
   */
  validateEndobj(
    bt: BufferedTokenizer,
    baseOffset: ByteOffset,
  ): Option<PdfParseError> {
    const endobjToken = bt.next();
    if (
      endobjToken.type === TokenType.Keyword &&
      endobjToken.value === "endobj"
    ) {
      return none;
    }
    if (endobjToken.type === TokenType.EOF) {
      return some({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Expected endobj but reached EOF",
        offset: ByteOffset.add(baseOffset, endobjToken.offset),
      });
    }
    return some({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Expected "endobj", got ${String(endobjToken.value)}`,
      offset: ByteOffset.add(baseOffset, endobjToken.offset),
    });
  },

  /**
   * endstream 後の絶対位置から `endobj` キーワードを検査する。
   *
   * @param fullData - PDF ファイル全体のバイト配列
   * @param afterEndstreamAbsPos - endstream 後の絶対バイト位置
   * @returns endobj 一致時は `none`、不一致・EOF 時は `some(PdfParseError)`
   */
  validateEndobjAt(
    fullData: Uint8Array,
    afterEndstreamAbsPos: ByteOffset,
  ): Option<PdfParseError> {
    const absPos = afterEndstreamAbsPos as number;
    const endobjBt = new BufferedTokenizer(
      new Tokenizer(fullData.subarray(absPos)),
    );
    const endobjToken = endobjBt.next();
    if (
      endobjToken.type === TokenType.Keyword &&
      endobjToken.value === "endobj"
    ) {
      return none;
    }
    if (endobjToken.type === TokenType.EOF) {
      return some({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Expected endobj after endstream but reached EOF",
        offset: afterEndstreamAbsPos,
      });
    }
    return some({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: `Expected "endobj" after endstream, got ${String(endobjToken.value)}`,
      offset: ByteOffset.of(absPos + (endobjToken.offset as number)),
    });
  },
} as const;
