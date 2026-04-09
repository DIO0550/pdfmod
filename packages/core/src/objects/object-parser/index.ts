import type { PdfParseError } from "../../errors/error/index";
import type { PdfError } from "../../errors/index";
import { Tokenizer } from "../../lexer/tokenizer/index";
import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import { GenerationNumber } from "../../types/generation-number/index";
import type { Token } from "../../types/index";
import { TokenType } from "../../types/index";
import { ObjectNumber } from "../../types/object-number/index";
import type { PdfDictionary, PdfObject } from "../../types/pdf-types/index";

/**
 * /Length が間接参照の場合に値を解決するコールバック。
 * ObjectResolver.resolve() のアダプタとして渡される。
 *
 * @param objectNumber - 解決対象のオブジェクト番号
 * @param generationNumber - 解決対象の世代番号
 * @returns 解決された長さ、またはエラー
 */
export type ResolveLength = (
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
) => Promise<Result<number, PdfError>>;

/**
 * parseIndirectObject の戻り値。
 * objNum/genNum はパースした obj ヘッダから取得。
 */
export interface IndirectObjectResult {
  readonly objectNumber: ObjectNumber;
  readonly generationNumber: GenerationNumber;
  readonly value: PdfObject;
}

const MAX_NESTING_DEPTH = 100;
const LF = 0x0a;
const CR = 0x0d;

/**
 * Tokenizer をラップし pushBack によるトークンの巻き戻しを提供する。
 */
class BufferedTokenizer {
  private readonly tokenizer: Tokenizer;
  private readonly buffer: Token[] = [];

  /**
   * @param tokenizer - ラップ対象の Tokenizer
   */
  constructor(tokenizer: Tokenizer) {
    this.tokenizer = tokenizer;
  }

  /**
   * 次のトークンを返す。バッファにトークンがあればそちらを優先する。
   *
   * @returns 次のトークン
   */
  next(): Token {
    const buffered = this.buffer.pop();
    if (buffered !== undefined) {
      return buffered;
    }
    return this.tokenizer.nextToken();
  }

  /**
   * トークンをバッファに戻す（スタック方式）。
   *
   * @param token - 戻すトークン
   */
  pushBack(token: Token): void {
    this.buffer.push(token);
  }

  /**
   * 内部 Tokenizer の現在位置を返す。
   *
   * @returns バイトオフセット
   */
  get position(): number {
    return this.tokenizer.position;
  }
}

/**
 * 16進文字列をバイト配列に変換する。奇数桁の場合は末尾に 0 を補う。
 *
 * @param hex - 16進文字列
 * @returns バイト配列
 */
function hexStringToBytes(hex: string): Uint8Array {
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * リテラル文字列をバイト配列に変換する。
 *
 * @param str - リテラル文字列
 * @returns バイト配列
 */
function literalStringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

/**
 * トークンから PdfObject を1つ読み取る（再帰）。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @returns パースされた PdfObject、またはエラー
 */
function readValue(
  bt: BufferedTokenizer,
  baseOffset: number,
  depth: number,
): Result<PdfObject, PdfParseError> {
  const token = bt.next();

  switch (token.type) {
    case TokenType.Null:
      return ok({ type: "null" });

    case TokenType.Boolean:
      return ok({ type: "boolean", value: token.value as boolean });

    case TokenType.Integer: {
      const intVal = token.value as number;
      if (Number.isNaN(intVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN integer token at offset ${token.offset}`,
          offset: ByteOffset.of(baseOffset + (token.offset as number)),
        });
      }
      return readIntegerOrIndirectRef(bt, baseOffset, intVal);
    }

    case TokenType.Real: {
      const realVal = token.value as number;
      if (Number.isNaN(realVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN real token at offset ${token.offset}`,
          offset: ByteOffset.of(baseOffset + (token.offset as number)),
        });
      }
      return ok({ type: "real", value: realVal });
    }

    case TokenType.Name:
      return ok({ type: "name", value: token.value as string });

    case TokenType.LiteralString:
      return ok({
        type: "string",
        value: literalStringToBytes(token.value as string),
        encoding: "literal" as const,
      });

    case TokenType.HexString:
      return ok({
        type: "string",
        value: hexStringToBytes(token.value as string),
        encoding: "hex" as const,
      });

    case TokenType.ArrayBegin:
      return readArrayElements(bt, baseOffset, depth + 1, token);

    case TokenType.DictBegin:
      return readDictEntries(bt, baseOffset, depth + 1, token);

    case TokenType.EOF:
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unexpected EOF",
        offset: ByteOffset.of(baseOffset + (token.offset as number)),
      });

    default:
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected token type ${token.type}: ${String(token.value)}`,
        offset: ByteOffset.of(baseOffset + (token.offset as number)),
      });
  }
}

/**
 * Integer トークンを読み取った後、indirect-ref かどうかを判定する。
 * 3 トークン先読みで Integer Integer R パターンを検出する。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param intVal - 最初の Integer トークンの値
 * @returns PdfObject（integer または indirect-ref）
 */
function readIntegerOrIndirectRef(
  bt: BufferedTokenizer,
  _baseOffset: number,
  intVal: number,
): Result<PdfObject, PdfParseError> {
  const second = bt.next();
  if (second.type !== TokenType.Integer) {
    bt.pushBack(second);
    return ok({ type: "integer", value: intVal });
  }

  const secondVal = second.value as number;
  if (Number.isNaN(secondVal)) {
    bt.pushBack(second);
    return ok({ type: "integer", value: intVal });
  }

  const third = bt.next();
  if (third.type === TokenType.Keyword && third.value === "R") {
    return ok({
      type: "indirect-ref",
      objectNumber: intVal,
      generationNumber: secondVal,
    });
  }

  bt.pushBack(third);
  bt.pushBack(second);
  return ok({ type: "integer", value: intVal });
}

/**
 * 配列要素を `]` まで再帰的に読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @param openToken - `[` トークン（エラー報告用）
 * @returns 配列 PdfObject、またはエラー
 */
function readArrayElements(
  bt: BufferedTokenizer,
  baseOffset: number,
  depth: number,
  openToken: Token,
): Result<PdfObject, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Array nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.of(baseOffset + (openToken.offset as number)),
    });
  }

  const elements: PdfObject[] = [];
  for (;;) {
    const token = bt.next();
    if (token.type === TokenType.ArrayEnd) {
      return ok({ type: "array", elements });
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated array",
        offset: ByteOffset.of(baseOffset + (openToken.offset as number)),
      });
    }
    bt.pushBack(token);
    const elemResult = readValue(bt, baseOffset, depth);
    if (!elemResult.ok) {
      return elemResult;
    }
    elements.push(elemResult.value);
  }
}

/**
 * 辞書エントリを `>>` まで読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @param openToken - `<<` トークン（エラー報告用）
 * @returns 辞書 PdfObject、またはエラー
 */
function readDictEntries(
  bt: BufferedTokenizer,
  baseOffset: number,
  depth: number,
  openToken: Token,
): Result<PdfDictionary, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Dictionary nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.of(baseOffset + (openToken.offset as number)),
    });
  }

  const entries = new Map<string, PdfObject>();
  for (;;) {
    const keyToken = bt.next();
    if (keyToken.type === TokenType.DictEnd) {
      return ok({ type: "dictionary", entries });
    }
    if (keyToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated dictionary",
        offset: ByteOffset.of(baseOffset + (openToken.offset as number)),
      });
    }
    if (keyToken.type !== TokenType.Name) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Dictionary key must be a name, got ${keyToken.type}`,
        offset: ByteOffset.of(baseOffset + (keyToken.offset as number)),
      });
    }

    const valResult = readValue(bt, baseOffset, depth);
    if (!valResult.ok) {
      return valResult;
    }
    entries.set(keyToken.value as string, valResult.value);
  }
}

interface StreamExtractResult {
  readonly object: PdfObject;
  readonly afterEndstreamAbsPos: number;
}

/**
 * stream キーワード後の改行を検証し、ストリームデータを切り出す。
 * fullData 上の absPos（= baseOffset + bt.position）から改行を検出する。
 *
 * @param fullData - PDF ファイル全体のバイト配列
 * @param baseOffset - parse/parseIndirectObject に渡された offset
 * @param relPos - Tokenizer の現在位置（subData 基準）
 * @param dict - ストリーム辞書
 * @param length - ストリームデータ長
 * @returns stream PdfObject と endstream 後の絶対位置、またはエラー
 */
function extractStream(
  fullData: Uint8Array,
  baseOffset: number,
  relPos: number,
  dict: PdfDictionary,
  length: number,
): Result<StreamExtractResult, PdfParseError> {
  if (!Number.isSafeInteger(length) || length < 0) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `/Length value is invalid: ${length}`,
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }

  const absPos = baseOffset + relPos;
  let streamStart: number;

  if (fullData[absPos] === LF) {
    streamStart = absPos + 1;
  } else if (fullData[absPos] === CR) {
    if (fullData[absPos + 1] === LF) {
      streamStart = absPos + 2;
    } else {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: "stream keyword must be followed by LF or CRLF, got CR alone",
        offset: ByteOffset.of(baseOffset + relPos),
      });
    }
  } else {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: "stream keyword must be followed by LF or CRLF",
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }

  if (streamStart + length > fullData.length) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `/Length ${length} exceeds available data`,
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }

  const streamData = fullData.subarray(streamStart, streamStart + length);

  const afterStreamPos = streamStart + length;
  const afterBt = new BufferedTokenizer(
    new Tokenizer(fullData.subarray(afterStreamPos)),
  );
  const endstreamToken = afterBt.next();
  if (
    endstreamToken.type !== TokenType.Keyword ||
    endstreamToken.value !== "endstream"
  ) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `Expected "endstream", got ${String(endstreamToken.value)}`,
      offset: ByteOffset.of(afterStreamPos),
    });
  }

  const afterEndstreamAbsPos = afterStreamPos + afterBt.position;
  return ok({
    object: { type: "stream", dictionary: dict, data: streamData },
    afterEndstreamAbsPos,
  });
}

/**
 * 辞書の /Length エントリから直値の長さを取得する。
 * indirect-ref の場合は null を返す（呼び出し側で非同期解決が必要）。
 *
 * @param dict - ストリーム辞書
 * @param baseOffset - エラー報告用の基準オフセット
 * @param relPos - エラー報告用の相対位置
 * @returns 長さ値、null（indirect-ref）、またはエラー
 */
function getStreamLengthSync(
  dict: PdfDictionary,
  baseOffset: number,
  relPos: number,
): Result<number, PdfParseError> | null {
  const lengthObj = dict.entries.get("Length");
  if (lengthObj === undefined) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: "/Length entry is missing from stream dictionary",
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }
  if (lengthObj.type === "indirect-ref") {
    return null;
  }
  if (lengthObj.type !== "integer") {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: `/Length has unexpected type: ${lengthObj.type}`,
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }
  return ok(lengthObj.value);
}

/**
 * 辞書の /Length エントリから長さを取得する（indirect-ref 対応、非同期）。
 *
 * @param dict - ストリーム辞書
 * @param baseOffset - エラー報告用の基準オフセット
 * @param relPos - エラー報告用の相対位置
 * @param resolveLength - indirect-ref 解決コールバック（省略時はエラー）
 * @returns 長さ値、またはエラー
 */
async function getStreamLengthAsync(
  dict: PdfDictionary,
  baseOffset: number,
  relPos: number,
  resolveLength?: ResolveLength,
): Promise<Result<number, PdfError>> {
  const lengthObj = dict.entries.get("Length");
  if (lengthObj === undefined) {
    return err({
      code: "OBJECT_PARSE_STREAM_LENGTH",
      message: "/Length entry is missing from stream dictionary",
      offset: ByteOffset.of(baseOffset + relPos),
    });
  }

  if (lengthObj.type === "integer") {
    return ok(lengthObj.value);
  }

  if (lengthObj.type === "indirect-ref") {
    if (resolveLength === undefined) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message:
          "/Length is an indirect reference but resolveLength was not provided",
        offset: ByteOffset.of(baseOffset + relPos),
      });
    }
    const resolved = await resolveLength(
      ObjectNumber.of(lengthObj.objectNumber),
      GenerationNumber.of(lengthObj.generationNumber),
    );
    if (!resolved.ok) {
      return err({
        code: "OBJECT_PARSE_STREAM_LENGTH",
        message: `/Length indirect reference resolution failed: ${resolved.error.message}`,
        offset: ByteOffset.of(baseOffset + relPos),
      });
    }
    return ok(resolved.value);
  }

  return err({
    code: "OBJECT_PARSE_STREAM_LENGTH",
    message: `/Length has unexpected type: ${lengthObj.type}`,
    offset: ByteOffset.of(baseOffset + relPos),
  });
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
  parse(data: Uint8Array, offset: number): Result<PdfObject, PdfParseError> {
    if (offset < 0 || offset >= data.length) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Offset ${offset} is out of range [0, ${data.length})`,
        offset: ByteOffset.of(Math.max(0, offset)),
      });
    }

    const subData = data.subarray(offset);
    const bt = new BufferedTokenizer(new Tokenizer(subData));
    const result = readValue(bt, offset, 0);
    if (!result.ok) {
      return result;
    }

    if (result.value.type === "dictionary") {
      const peekToken = bt.next();
      if (
        peekToken.type === TokenType.Keyword &&
        peekToken.value === "stream"
      ) {
        const lengthResult = getStreamLengthSync(
          result.value,
          offset,
          bt.position,
        );
        if (lengthResult === null) {
          return err({
            code: "OBJECT_PARSE_STREAM_LENGTH",
            message:
              "/Length is an indirect reference; use parseIndirectObject for indirect /Length resolution",
            offset: ByteOffset.of(offset + bt.position),
          });
        }
        if (!lengthResult.ok) {
          return lengthResult;
        }
        const streamResult = extractStream(
          data,
          offset,
          bt.position,
          result.value,
          lengthResult.value,
        );
        if (!streamResult.ok) {
          return streamResult;
        }
        return ok(streamResult.value.object);
      }
      bt.pushBack(peekToken);
    }

    return result;
  },

  /**
   * data の offset 位置から間接オブジェクト定義 (N G obj ... endobj) をパースする。
   *
   * @param data - PDF バイト配列
   * @param offset - data に対する相対位置
   * @param resolveLength - /Length が間接参照の場合の解決コールバック
   * @returns パースされた IndirectObjectResult、またはエラー
   */
  async parseIndirectObject(
    data: Uint8Array,
    offset: number,
    resolveLength?: ResolveLength,
  ): Promise<Result<IndirectObjectResult, PdfError>> {
    if (offset < 0 || offset >= data.length) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Offset ${offset} is out of range [0, ${data.length})`,
        offset: ByteOffset.of(Math.max(0, offset)),
      });
    }

    const subData = data.subarray(offset);
    const bt = new BufferedTokenizer(new Tokenizer(subData));

    const headerResult = readObjHeader(bt, offset);
    if (!headerResult.ok) {
      return headerResult;
    }
    const { objectNumber, generationNumber } = headerResult.value;

    const bodyResult = readValue(bt, offset, 0);
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
        const lengthResult = await getStreamLengthAsync(
          value,
          offset,
          bt.position,
          resolveLength,
        );
        if (!lengthResult.ok) {
          return lengthResult;
        }
        const streamResult = extractStream(
          data,
          offset,
          bt.position,
          value,
          lengthResult.value,
        );
        if (!streamResult.ok) {
          return streamResult;
        }
        return expectEndobjAfterStream(
          data,
          streamResult.value.object,
          streamResult.value.afterEndstreamAbsPos,
          objectNumber,
          generationNumber,
        );
      } else {
        bt.pushBack(peekToken);
      }
    }

    return expectEndobj(bt, offset, objectNumber, generationNumber, value);
  },
} as const;

/**
 * obj ヘッダ（Integer Integer "obj"）を読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用の基準オフセット
 * @returns objectNumber と generationNumber、またはエラー
 */
function readObjHeader(
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
      message: `Expected "obj" keyword, got ${String(objKeyword.value)}`,
      offset: ByteOffset.of(baseOffset + (objKeyword.offset as number)),
    });
  }

  return ok({
    objectNumber: ObjectNumber.of(objNumToken.value as number),
    generationNumber: GenerationNumber.of(genNumToken.value as number),
  });
}

/**
 * endobj キーワードを確認し IndirectObjectResult を返す（非 stream 用）。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - エラー報告用の基準オフセット
 * @param objectNumber - オブジェクト番号
 * @param generationNumber - 世代番号
 * @param value - パース済みの PdfObject
 * @returns IndirectObjectResult、またはエラー
 */
function expectEndobj(
  bt: BufferedTokenizer,
  baseOffset: number,
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
  value: PdfObject,
): Result<IndirectObjectResult, PdfError> {
  const endobjToken = bt.next();
  if (
    endobjToken.type === TokenType.Keyword &&
    endobjToken.value === "endobj"
  ) {
    return ok({ objectNumber, generationNumber, value });
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
}

/**
 * stream 後の endobj を afterEndstreamAbsPos から検証する。
 *
 * @param fullData - PDF ファイル全体のバイト配列
 * @param value - パース済みの stream PdfObject
 * @param afterEndstreamAbsPos - endstream 後の絶対バイト位置
 * @param objectNumber - オブジェクト番号
 * @param generationNumber - 世代番号
 * @returns IndirectObjectResult、またはエラー
 */
function expectEndobjAfterStream(
  fullData: Uint8Array,
  value: PdfObject,
  afterEndstreamAbsPos: number,
  objectNumber: ObjectNumber,
  generationNumber: GenerationNumber,
): Result<IndirectObjectResult, PdfError> {
  const endobjBt = new BufferedTokenizer(
    new Tokenizer(fullData.subarray(afterEndstreamAbsPos)),
  );
  const endobjToken = endobjBt.next();
  if (
    endobjToken.type === TokenType.Keyword &&
    endobjToken.value === "endobj"
  ) {
    return ok({ objectNumber, generationNumber, value });
  }
  if (endobjToken.type === TokenType.EOF) {
    return err({
      code: "OBJECT_PARSE_UNTERMINATED",
      message: "Expected endobj after endstream but reached EOF",
      offset: ByteOffset.of(afterEndstreamAbsPos),
    });
  }
  return err({
    code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
    message: `Expected "endobj" after endstream, got ${String(endobjToken.value)}`,
    offset: ByteOffset.of(
      afterEndstreamAbsPos + (endobjToken.offset as number),
    ),
  });
}
