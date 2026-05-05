import {
  isPdfDelimiter,
  isPdfWhitespace,
  matchesBytesAt,
} from "../../lexer/bytes/index";
import { Tokenizer } from "../../lexer/tokenizer/index";
import type {
  PdfError,
  Token,
  TokenInlineImage,
  TokenInlineImageDictEntry,
} from "../../pdf/index";
import { ByteOffset, TokenType } from "../../pdf/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

const AsciiUpperE = 0x45;
const AsciiUpperI = 0x49;
const AsciiLineFeed = 0x0a;
const AsciiCarriageReturn = 0x0d;
const InlineImageEnd = [AsciiUpperE, AsciiUpperI] as const;
const InlineImageBeginMarkerLength = 2;

export interface InlineImageReadResult {
  readonly token: TokenInlineImage;
  readonly nextOffset: number;
}

interface InlineImageDictionaryReadResult {
  readonly entries: ReadonlyArray<TokenInlineImageDictEntry>;
  readonly afterIdOffset: number;
}

interface InlineImageEndReadResult {
  readonly dataEndOffset: number;
  readonly nextOffset: number;
}

/**
 * BI token の直後から inline image 全体を読み取る。
 *
 * @param params - content stream data と BI 周辺 offset
 * @returns InlineImage token と EI 直後の offset
 */
export function readInlineImage(params: {
  readonly data: Uint8Array;
  readonly beginOffset: ByteOffset;
  readonly afterBeginOffset: number;
}): Result<InlineImageReadResult, PdfError> {
  const dictionary = readInlineImageDictionary({
    data: params.data,
    startOffset: params.afterBeginOffset,
  });
  if (!dictionary.ok) {
    return dictionary;
  }

  const end = findInlineImageEnd({
    data: params.data,
    startOffset: dictionary.value.afterIdOffset,
  });
  if (!end.ok) {
    return end;
  }

  return ok({
    token: {
      type: TokenType.InlineImage,
      dict: dictionary.value.entries,
      data: params.data.subarray(
        dictionary.value.afterIdOffset,
        end.value.dataEndOffset,
      ),
      offset: params.beginOffset,
    },
    nextOffset: end.value.nextOffset,
  });
}

/**
 * inline image 辞書の key/value pair を ID まで読み取る。
 *
 * @param params - content stream data と読み取り開始 offset
 * @returns 辞書 entries と画像 data 開始 offset
 */
function readInlineImageDictionary(params: {
  readonly data: Uint8Array;
  readonly startOffset: number;
}): Result<InlineImageDictionaryReadResult, PdfError> {
  const tokenizer = new Tokenizer(params.data);
  const seekError = tokenizer.seek(params.startOffset);
  if (seekError.some) {
    return err(seekError.value);
  }

  const entries: TokenInlineImageDictEntry[] = [];

  while (true) {
    const key = tokenizer.nextToken();
    if (isKeyword(key, "ID")) {
      return ok({
        entries,
        afterIdOffset: consumeDataPrefix(params.data, tokenizer.position),
      });
    }
    if (isInlineImageDataBegin(key)) {
      return ok({
        entries,
        afterIdOffset: Number(key.offset) + InlineImageBeginMarkerLength,
      });
    }
    if (key.type === TokenType.EOF) {
      return invalidInlineImage(
        "Inline image ID marker is missing",
        key.offset,
      );
    }
    if (key.type !== TokenType.Name) {
      return invalidInlineImage(
        "Inline image dictionary key must be a name",
        key.offset,
      );
    }

    const value = tokenizer.nextToken();
    if (value.type === TokenType.EOF || isKeyword(value, "ID")) {
      return invalidInlineImage(
        "Inline image dictionary value is missing",
        value.offset,
      );
    }
    if (isKeyword(value, "BI")) {
      return invalidInlineImage(
        "Nested inline image dictionary is invalid",
        value.offset,
      );
    }

    entries.push({ key, value });
  }
}

/**
 * inline image data の終端 EI を byte scan で探す。
 *
 * @param params - content stream data と data 開始 offset
 * @returns data 終了 offset と EI 直後 offset
 */
function findInlineImageEnd(params: {
  readonly data: Uint8Array;
  readonly startOffset: number;
}): Result<InlineImageEndReadResult, PdfError> {
  for (let offset = params.startOffset; offset < params.data.length; offset++) {
    if (!isInlineImageEndAt(params.data, offset)) {
      continue;
    }

    return ok({
      dataEndOffset: offset - 1,
      nextOffset: offset + InlineImageEnd.length,
    });
  }

  return invalidInlineImage(
    "Inline image EI marker is missing",
    ByteOffset.of(params.data.length),
  );
}

/**
 * ID 直後の 1 個の whitespace/EOL marker を data から除外する。
 *
 * @param data - content stream data
 * @param offset - ID token 直後 offset
 * @returns inline image data 開始 offset
 */
function consumeDataPrefix(data: Uint8Array, offset: number): number {
  if (offset >= data.length) {
    return offset;
  }

  if (
    data[offset] === AsciiCarriageReturn &&
    data[offset + 1] === AsciiLineFeed
  ) {
    return offset + 2;
  }
  if (isPdfWhitespace(data[offset])) {
    return offset + 1;
  }
  return offset;
}

/**
 * 指定位置が boundary で区切られた EI marker かどうかを判定する。
 *
 * @param data - content stream data
 * @param offset - EI 候補 offset
 * @returns inline image 終端であれば true
 */
function isInlineImageEndAt(data: Uint8Array, offset: number): boolean {
  if (!matchesBytesAt(data, offset, InlineImageEnd)) {
    return false;
  }
  if (offset === 0 || !isPdfWhitespace(data[offset - 1])) {
    return false;
  }

  const afterEndOffset = offset + InlineImageEnd.length;
  if (afterEndOffset >= data.length) {
    return true;
  }

  return (
    isPdfWhitespace(data[afterEndOffset]) ||
    isPdfDelimiter(data[afterEndOffset])
  );
}

/**
 * Keyword token の値を確認する。
 *
 * @param token - 判定対象 token
 * @param value - 期待 keyword
 * @returns 一致すれば true
 */
function isKeyword(token: Token, value: string): boolean {
  return token.type === TokenType.Keyword && token.value === value;
}

/**
 * ID 直後に whitespace がない inline image data 開始を判定する。
 *
 * @param token - 判定対象 token
 * @returns ID marker 直後に data が続く keyword であれば true
 */
function isInlineImageDataBegin(token: Token): boolean {
  return token.type === TokenType.Keyword && token.value.startsWith("ID");
}

/**
 * inline image 不正エラーを生成する。
 *
 * @param message - エラーメッセージ
 * @param offset - エラー位置
 * @returns PdfError Result
 */
function invalidInlineImage<T>(
  message: string,
  offset: ByteOffset,
): Result<T, PdfError> {
  return err({
    code: "CONTENT_STREAM_INLINE_IMAGE_INVALID",
    message,
    offset,
  });
}
