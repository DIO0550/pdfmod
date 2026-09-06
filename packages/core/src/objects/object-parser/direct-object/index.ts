import type { PdfParseError } from "../../../pdf/errors/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type { Token } from "../../../pdf/types/index";
import { TokenType, tokenDisplayString } from "../../../pdf/types/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type {
  PdfDictionary,
  PdfValue,
} from "../../../pdf/types/pdf-types/index";
import type { Option } from "../../../utils/option/index";
import { none, some } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";
import type { BufferedTokenizer } from "../buffered-tokenizer/index";
import { decodeHexString, decodeLiteralString } from "../string-decoder/index";

// PDF仕様上の明示的な上限はなく、再帰的な配列/辞書ネストによるスタックオーバーフロー防止のための防御的な上限値。
const MAX_NESTING_DEPTH = 100;
/** フリーリストの先頭に予約されたオブジェクト番号（ISO 32000-1 §7.5.4）。 */
const FREE_LIST_HEAD_OBJECT_NUMBER = 0;

/**
 * direct object (stream を含まない PdfValue) を BufferedTokenizer からパースするコンパニオンオブジェクト。
 *
 * PDF 仕様 7.3.2-7.3.7, 7.3.9 の direct object、および 7.3.10 の indirect reference を扱う。
 */
export const DirectObject = {
  /**
   * BufferedTokenizer から direct object を1つパースする。
   *
   * @param bt - バッファ付きトークナイザ
   * @param baseOffset - 呼び出し元 data 基準の開始オフセット
   * @param depth - 現在のネスト深度
   * @returns PdfValue、またはエラー
   */
  parse(
    bt: BufferedTokenizer,
    baseOffset: ByteOffset,
    depth: number,
  ): Result<PdfValue, PdfParseError> {
    return readValue(bt, baseOffset, depth);
  },
} as const;

/**
 * トークンから PdfValue を1つ読み取る（再帰）。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @returns PdfValue、またはエラー
 */
function readValue(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
): Result<PdfValue, PdfParseError> {
  const token = bt.next();

  switch (token.type) {
    case TokenType.Null:
      return ok({ type: "null" });

    case TokenType.Boolean:
      return ok({ type: "boolean", value: token.value });

    case TokenType.Integer: {
      const intVal = token.value;
      if (Number.isNaN(intVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN integer token at offset ${token.offset}`,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      const refResult = tryReadIndirectRef(bt, baseOffset, intVal);
      if (refResult.some) {
        return refResult.value;
      }
      return ok({ type: "integer", value: intVal });
    }

    case TokenType.Real: {
      const realVal = token.value;
      if (Number.isNaN(realVal)) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `NaN real token at offset ${token.offset}`,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({ type: "real", value: realVal });
    }

    case TokenType.Name:
      return ok({ type: "name", value: token.value });

    case TokenType.LiteralString: {
      const literalResult = decodeLiteralString(token.value);
      if (!literalResult.ok) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: literalResult.error,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({
        type: "string",
        value: literalResult.value,
        encoding: "literal" as const,
      });
    }

    case TokenType.HexString: {
      const hexResult = decodeHexString(token.value);
      if (!hexResult.ok) {
        return err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: hexResult.error,
          offset: ByteOffset.add(baseOffset, token.offset),
        });
      }
      return ok({
        type: "string",
        value: hexResult.value,
        encoding: "hex" as const,
      });
    }

    case TokenType.ArrayBegin:
      return readArrayElements(bt, baseOffset, depth + 1, token);

    case TokenType.DictBegin:
      return readDictEntries(bt, baseOffset, depth + 1, token);

    case TokenType.EOF:
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unexpected EOF",
        offset: ByteOffset.add(baseOffset, token.offset),
      });

    default:
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Unexpected token type ${token.type}: ${tokenDisplayString(token)}`,
        offset: ByteOffset.add(baseOffset, token.offset),
      });
  }
}

/**
 * Integer トークン後の `N G R` パターンを試行する。
 * 3トークン先読みしパターン不一致なら pushBack して None を返す。
 *
 * `N == 0` のときは参照値ではなく null オブジェクト（`{ type: "null" }`）を返す。
 * オブジェクト番号 0 は ISO 32000-1 §7.5.4 のフリーリスト先頭に予約された番号で、
 * `docs/specs/02a_object_resolution.md` §2.4 により常に null に解決されるため
 * （#334）。関数名は「参照の読み取り試行」のままだが、返り値には null が含まれる。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param intVal - 先頭の integer 値（オブジェクト番号候補）
 * @returns 成立: Some(ok(indirect-ref))、`N == 0`: Some(ok(null))、
 *   不成立: None、N/G 不正: Some(err(...))
 */
function tryReadIndirectRef(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  intVal: number,
): Option<Result<PdfValue, PdfParseError>> {
  const second = bt.next();
  if (second.type !== TokenType.Integer) {
    bt.pushBack(second);
    return none;
  }

  const secondVal = second.value;
  if (Number.isNaN(secondVal)) {
    bt.pushBack(second);
    return none;
  }

  const third = bt.next();
  if (third.type === TokenType.Keyword && third.value === "R") {
    const generationNumber = GenerationNumber.create(secondVal);
    if (!generationNumber.ok) {
      return some(
        err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `Invalid indirect reference generation number: ${generationNumber.error}`,
          offset: ByteOffset.add(baseOffset, third.offset),
        }),
      );
    }

    // ISO 32000-1 §7.5.4 / docs/specs/02a_object_resolution.md §2.4:
    // オブジェクト番号 0 はフリーリストのヘッド専用の予約番号であり、`0 G R` は
    // 構文としては合法だが解決結果は常に null になる。ObjectNumber（§7.3.10 の正整数）
    // では表現できないため、参照ノードを作らずここで null オブジェクトを返す。
    // 構文エラーにしないのは Postel の法則（docs/specs/09_implementation_guide.md §3.1）と、
    // 解決仕様が「type=0 (Free) → null を返却」と規定していることに従うため。
    if (intVal === FREE_LIST_HEAD_OBJECT_NUMBER) {
      return some(ok({ type: "null" }));
    }

    const objectNumber = ObjectNumber.create(intVal);
    if (!objectNumber.ok) {
      return some(
        err({
          code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
          message: `Invalid indirect reference object number: ${objectNumber.error}`,
          offset: ByteOffset.add(baseOffset, third.offset),
        }),
      );
    }

    return some(
      ok({
        type: "indirect-ref",
        objectNumber: objectNumber.value,
        generationNumber: generationNumber.value,
      }),
    );
  }

  bt.pushBack(third);
  bt.pushBack(second);
  return none;
}

/**
 * 配列要素を `]` まで再帰的に読み取る。
 *
 * @param bt - バッファ付きトークナイザ
 * @param baseOffset - 呼び出し元 data 基準の開始オフセット
 * @param depth - 現在のネスト深度
 * @param openToken - `[` トークン（エラー報告用）
 * @returns 配列 PdfValue、またはエラー
 */
function readArrayElements(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
  openToken: Token,
): Result<PdfValue, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Array nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.add(baseOffset, openToken.offset),
    });
  }

  const elements: PdfValue[] = [];
  while (true) {
    const token = bt.next();
    if (token.type === TokenType.ArrayEnd) {
      return ok({ type: "array", elements });
    }
    if (token.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated array",
        offset: ByteOffset.add(baseOffset, openToken.offset),
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
 * @returns 辞書、またはエラー
 */
function readDictEntries(
  bt: BufferedTokenizer,
  baseOffset: ByteOffset,
  depth: number,
  openToken: Token,
): Result<PdfDictionary, PdfParseError> {
  if (depth > MAX_NESTING_DEPTH) {
    return err({
      code: "NESTING_TOO_DEEP",
      message: `Dictionary nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`,
      offset: ByteOffset.add(baseOffset, openToken.offset),
    });
  }

  const entries = new Map<string, PdfValue>();
  while (true) {
    const keyToken = bt.next();
    if (keyToken.type === TokenType.DictEnd) {
      return ok({ type: "dictionary", entries });
    }
    if (keyToken.type === TokenType.EOF) {
      return err({
        code: "OBJECT_PARSE_UNTERMINATED",
        message: "Unterminated dictionary",
        offset: ByteOffset.add(baseOffset, openToken.offset),
      });
    }
    if (keyToken.type !== TokenType.Name) {
      return err({
        code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
        message: `Dictionary key must be a name, got ${keyToken.type}`,
        offset: ByteOffset.add(baseOffset, keyToken.offset),
      });
    }

    const valResult = readValue(bt, baseOffset, depth);
    if (!valResult.ok) {
      return valResult;
    }
    entries.set(keyToken.value, valResult.value);
  }
}
