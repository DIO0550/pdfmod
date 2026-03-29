import type { PdfParseError } from "../../../errors/index";
import {
  isPdfTokenBoundary,
  matchesBytesAt,
  skipWhitespaceAndComments,
} from "../../../lexer/pdf-bytes/index";
import type { Option } from "../../../option/index";
import { none, some } from "../../../option/index";
import type { Result } from "../../../result/index";
import { err, ok } from "../../../result/index";
import {
  type ByteOffset,
  ByteOffset as ByteOffsetCompanion,
} from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import type {
  XRefEntry,
  XRefFreeEntry,
  XRefTable,
  XRefUsedEntry,
} from "../../../types/index";
import { ObjectNumber } from "../../../types/object-number/index";

// --- バイト定数 (SCREAMING_SNAKE_CASE) ---

const XREF_BYTES = Array.from(new TextEncoder().encode("xref"));
const TRAILER_BYTES = Array.from(new TextEncoder().encode("trailer"));

const LF = 0x0a;
const CR = 0x0d;
const SPACE = 0x20;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;
const CHAR_N = 0x6e;
const CHAR_F = 0x66;

const ENTRY_BODY_LENGTH = 18;
const OFFSET_DIGITS = 10;
const GENERATION_DIGITS = 5;
const DECIMAL_RADIX = 10;

// --- エラーヘルパー ---

/**
 * xref テーブルパース失敗時のエラー Result を生成するヘルパー。
 *
 * @param message - エラーメッセージ
 * @param offset - 問題が検出されたバイトオフセット
 * @returns `Err<PdfParseError>` (コード: XREF_TABLE_INVALID)
 */
function failXRefTable(
  message: string,
  offset?: ByteOffset,
): Result<{ xref: XRefTable; trailerOffset: ByteOffset }, PdfParseError> {
  return err({ code: "XREF_TABLE_INVALID", message, offset });
}

// --- 内部ヘルパー ---

/**
 * 固定桁数の10進数をパースする。
 *
 * @param data - PDFバイト配列
 * @param pos - パース開始位置
 * @param digitCount - 読み取る桁数
 * @returns パースした数値、または桁数不足・非数字の場合は undefined
 */
function parseDecimalDigits(
  data: Uint8Array,
  pos: number,
  digitCount: number,
): number | undefined {
  if (pos + digitCount > data.length) {
    return undefined;
  }
  let value = 0;
  for (let i = 0; i < digitCount; i++) {
    const byte = data[pos + i];
    if (byte < DIGIT_0 || byte > DIGIT_9) {
      return undefined;
    }
    value = value * DECIMAL_RADIX + (byte - DIGIT_0);
  }
  return value;
}

/**
 * EOL パターンを検出し消費バイト数を返す。
 *
 * @param data - PDFバイト配列
 * @param pos - EOL 検出開始位置
 * @returns 消費バイト数、または未知パターンの場合は undefined
 */
function detectEol(data: Uint8Array, pos: number): number | undefined {
  if (pos >= data.length) {
    return undefined;
  }
  const byte = data[pos];
  if (byte === CR) {
    const next = pos + 1 < data.length ? data[pos + 1] : undefined;
    if (next === LF || next === SPACE) {
      return 2;
    }
    return 1;
  }
  if (byte === LF) {
    return 1;
  }
  return undefined;
}

/**
 * xref エントリ (18バイト本体 + EOL) をパースする。
 *
 * @param data - PDFバイト配列
 * @param pos - エントリ開始位置
 * @returns パース結果の entry と次の位置、またはエラー Result
 */
function parseEntry(
  data: Uint8Array,
  pos: number,
): Result<
  { entry: XRefFreeEntry | XRefUsedEntry; nextPos: number },
  PdfParseError
> {
  if (pos + ENTRY_BODY_LENGTH > data.length) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry truncated: insufficient data for 18-byte body",
      offset: ByteOffsetCompanion.of(pos),
    });
  }

  // offset (10桁)
  const offsetValue = parseDecimalDigits(data, pos, OFFSET_DIGITS);
  if (offsetValue === undefined) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry: invalid offset digits",
      offset: ByteOffsetCompanion.of(pos),
    });
  }

  // SPACE
  if (data[pos + OFFSET_DIGITS] !== SPACE) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry: expected SPACE after offset",
      offset: ByteOffsetCompanion.of(pos + OFFSET_DIGITS),
    });
  }

  // generation (5桁)
  const genPos = pos + OFFSET_DIGITS + 1;
  const genValue = parseDecimalDigits(data, genPos, GENERATION_DIGITS);
  if (genValue === undefined) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry: invalid generation digits",
      offset: ByteOffsetCompanion.of(genPos),
    });
  }

  // GenerationNumber バリデーション (0-65535)
  const genResult = GenerationNumber.create(genValue);
  if (!genResult.ok) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: `xref entry: invalid generation number ${genValue}`,
      offset: ByteOffsetCompanion.of(genPos),
    });
  }

  // SPACE
  const flagSepPos = genPos + GENERATION_DIGITS;
  if (data[flagSepPos] !== SPACE) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry: expected SPACE after generation",
      offset: ByteOffsetCompanion.of(flagSepPos),
    });
  }

  // status flag ('n' or 'f')
  const flagPos = flagSepPos + 1;
  const flagByte = data[flagPos];

  let entry: XRefFreeEntry | XRefUsedEntry;
  if (flagByte === CHAR_N) {
    entry = {
      type: 1,
      offset: ByteOffsetCompanion.of(offsetValue),
      generationNumber: genResult.value,
    };
  } else if (flagByte === CHAR_F) {
    entry = {
      type: 0,
      nextFreeObject: ObjectNumber.of(offsetValue),
      generationNumber: genResult.value,
    };
  } else {
    return err({
      code: "XREF_TABLE_INVALID",
      message: `xref entry: invalid status flag '${String.fromCharCode(flagByte)}', expected 'n' or 'f'`,
      offset: ByteOffsetCompanion.of(flagPos),
    });
  }

  // ステータスフラグ直後の任意の SPACE (0x20) をスキップしてから EOL を検出する。
  // 実PDFでは "f \r\n" / "n \r\n" のようにフラグ後にSPACEが入る形式が存在する。
  let eolScanPos = pos + ENTRY_BODY_LENGTH;
  while (eolScanPos < data.length && data[eolScanPos] === SPACE) {
    eolScanPos++;
  }

  if (eolScanPos >= data.length) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry truncated: missing EOL after 18-byte body",
      offset: ByteOffsetCompanion.of(eolScanPos),
    });
  }
  const eolLen = detectEol(data, eolScanPos);
  if (eolLen === undefined) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref entry: unknown EOL pattern",
      offset: ByteOffsetCompanion.of(eolScanPos),
    });
  }

  return ok({
    entry,
    nextPos: eolScanPos + eolLen,
  });
}

/**
 * サブセクションヘッダ "{firstObj} {count}" をパースする。
 * trailer キーワードを検出した場合は none を返す。
 *
 * @param data - PDFバイト配列
 * @param pos - ヘッダ開始位置
 * @returns Some({ firstObj, count, nextPos }) または None (trailer 検出時)
 */
function parseSubsectionHeader(
  data: Uint8Array,
  pos: number,
): Result<
  Option<{ firstObj: number; count: number; nextPos: number }>,
  PdfParseError
> {
  // trailer チェック (トークン境界も検証)
  const afterTrailer = pos + TRAILER_BYTES.length;
  if (
    matchesBytesAt(data, pos, TRAILER_BYTES) &&
    (afterTrailer >= data.length || isPdfTokenBoundary(data[afterTrailer]))
  ) {
    return ok(none);
  }

  // firstObj (数字列)
  let firstObj = 0;
  let digits = 0;
  let i = pos;
  while (i < data.length && data[i] >= DIGIT_0 && data[i] <= DIGIT_9) {
    firstObj = firstObj * DECIMAL_RADIX + (data[i] - DIGIT_0);
    if (!Number.isSafeInteger(firstObj)) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "xref subsection header: object number overflow",
        offset: ByteOffsetCompanion.of(pos),
      });
    }
    digits++;
    i++;
  }
  if (digits === 0) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref subsection header: expected object number",
      offset: ByteOffsetCompanion.of(pos),
    });
  }

  // 区切りのホワイトスペース/コメントをスキップ（少なくとも1文字必要）
  const nextAfterFirstObj = skipWhitespaceAndComments(data, i);
  if (nextAfterFirstObj === i) {
    return err({
      code: "XREF_TABLE_INVALID",
      message:
        "xref subsection header: expected whitespace after object number",
      offset: ByteOffsetCompanion.of(i),
    });
  }
  i = nextAfterFirstObj;

  // count (数字列)
  let count = 0;
  digits = 0;
  while (i < data.length && data[i] >= DIGIT_0 && data[i] <= DIGIT_9) {
    count = count * DECIMAL_RADIX + (data[i] - DIGIT_0);
    if (!Number.isSafeInteger(count)) {
      return err({
        code: "XREF_TABLE_INVALID",
        message: "xref subsection header: entry count overflow",
        offset: ByteOffsetCompanion.of(i - digits),
      });
    }
    digits++;
    i++;
  }
  if (digits === 0) {
    return err({
      code: "XREF_TABLE_INVALID",
      message: "xref subsection header: expected entry count",
      offset: ByteOffsetCompanion.of(i),
    });
  }

  // count の直後は PDF トークン境界でなければならない
  if (i < data.length && !isPdfTokenBoundary(data[i])) {
    return err({
      code: "XREF_TABLE_INVALID",
      message:
        "xref subsection header: expected token boundary after entry count",
      offset: ByteOffsetCompanion.of(i),
    });
  }

  // ヘッダ後の空白・コメントをスキップ
  const nextPos = skipWhitespaceAndComments(data, i);

  return ok(some({ firstObj, count, nextPos }));
}

/**
 * テキスト形式の xref テーブルを解析し、XRefTable と trailerOffset を返す。
 * ISO 32000 7.5.4 に基づき、複数サブセクション・EOL バリエーション
 * (CR+LF, LF, CR, CR+SP) に対応する。
 *
 * @param data - PDF ファイル全体のバイト配列
 * @param offset - xref テーブルの開始バイトオフセット
 * @returns 成功時は `Ok<{ xref: XRefTable; trailerOffset: ByteOffset }>`,
 *   失敗時は `Err<PdfParseError>` (コード: XREF_TABLE_INVALID)
 *
 * @example
 * ```ts
 * const result = parseXRefTable(data, startXRefOffset);
 * if (result.ok) {
 *   const { xref, trailerOffset } = result.value;
 *   console.log(`entries: ${xref.entries.size}, size: ${xref.size}`);
 * }
 * ```
 */
export function parseXRefTable(
  data: Uint8Array,
  offset: ByteOffset,
): Result<{ xref: XRefTable; trailerOffset: ByteOffset }, PdfParseError> {
  // 入力境界チェック
  if (offset < 0 || offset >= data.length) {
    return failXRefTable("xref offset out of bounds", offset);
  }

  // xref キーワード確認 + 前後トークン境界チェック
  const afterXref = offset + XREF_BYTES.length;
  if (
    !matchesBytesAt(data, offset, XREF_BYTES) ||
    (offset > 0 && !isPdfTokenBoundary(data[offset - 1])) ||
    (afterXref < data.length && !isPdfTokenBoundary(data[afterXref]))
  ) {
    return failXRefTable("expected 'xref' keyword", offset);
  }

  // xref 後の空白・コメントをスキップ
  let pos = skipWhitespaceAndComments(data, afterXref);

  const entries = new Map<ObjectNumber, XRefEntry>();
  let size = 0;

  // サブセクションループ
  while (pos < data.length) {
    const headerResult = parseSubsectionHeader(data, pos);
    if (!headerResult.ok) {
      return headerResult;
    }

    const headerOption = headerResult.value;

    // trailer 検出
    if (!headerOption.some) {
      return ok({
        xref: { entries, size },
        trailerOffset: ByteOffsetCompanion.of(pos),
      });
    }

    const { firstObj, count, nextPos } = headerOption.value;
    const subsectionEnd = firstObj + count;
    if (!Number.isSafeInteger(subsectionEnd)) {
      return failXRefTable(
        "xref subsection length exceeds Number.MAX_SAFE_INTEGER",
        ByteOffsetCompanion.of(pos),
      );
    }
    if (subsectionEnd > size) {
      size = subsectionEnd;
    }

    // エントリパース
    let entryPos = nextPos;
    for (let i = 0; i < count; i++) {
      const entryResult = parseEntry(data, entryPos);
      if (!entryResult.ok) {
        return entryResult;
      }
      entries.set(ObjectNumber.of(firstObj + i), entryResult.value.entry);
      entryPos = entryResult.value.nextPos;
    }

    // 次のサブセクション前の空白をスキップ
    pos = skipWhitespaceAndComments(data, entryPos);
  }

  return failXRefTable(
    "trailer keyword not found",
    ByteOffsetCompanion.of(pos),
  );
}
