import { NumberEx } from "../../../ext/number/index";
import { none, type Option, some } from "../../../utils/option/index";
import { err, ok, type Result } from "../../../utils/result/index";
import type { PdfParseError } from "../../errors/index";
import type { PdfValue } from "../../types/pdf-types/index";

const CLEAR_TABLE = 256;
const EOD = 257;
const FIRST_DICTIONARY_CODE = 258;
const TABLE_SIZE = 4096;
const INITIAL_CODE_WIDTH = 9;
const MAX_CODE_WIDTH = 12;
const BITS_PER_BYTE = 8;
const INITIAL_BUFFER_SIZE = 4096;
const DEFAULT_MAX_DECOMPRESSED_MB = 100;
const BYTES_PER_KB = 1024;
const DEFAULT_MAX_DECOMPRESSED_SIZE =
  DEFAULT_MAX_DECOMPRESSED_MB * BYTES_PER_KB * BYTES_PER_KB;

/** LZW のコード幅を切り替えるタイミング (ISO 32000-1 Table 8)。 */
type EarlyChange = 0 | 1;

/** @param message - 失敗理由 @returns LZW 展開エラー */
function failLzw(message: string): Result<never, PdfParseError> {
  return err({ code: "LZWDECODE_FAILED", message });
}

const EarlyChange = {
  /** @param decodeParms - /DecodeParms 辞書 @returns EarlyChange、型・値が不正ならエラー */
  parse(
    decodeParms?: ReadonlyMap<string, PdfValue>,
  ): Result<EarlyChange, PdfParseError> {
    const entry = decodeParms?.get("EarlyChange");
    if (entry === undefined) {
      return ok(1);
    }
    if (entry.type !== "integer") {
      return failLzw("/EarlyChange must be an integer (0 or 1)");
    }
    const value = entry.value;
    const valid = value === 0 || value === 1;
    if (!valid) {
      return failLzw("/EarlyChange must be 0 or 1");
    }
    return ok(value);
  },
} as const;

/** LZW 展開に渡すストリーム固有のパラメータ。 */
export interface LzwDecodeOptions {
  readonly decodeParms?: ReadonlyMap<string, PdfValue>;
  readonly maxDecompressedSize?: number;
}

/** 可変長コードの読み取り、辞書と出力バッファを保持する展開機構。 */
class LzwDecoder {
  private bitOffset = 0;
  private codeWidth = INITIAL_CODE_WIDTH;
  private nextCode = FIRST_DICTIONARY_CODE;
  private previousCode: Option<number> = none;
  private readonly prefixes = new Uint16Array(TABLE_SIZE);
  private readonly suffixes = new Uint8Array(TABLE_SIZE);
  private readonly sequence = new Uint8Array(TABLE_SIZE);
  private output: Uint8Array;
  private outputLength = 0;

  /** @param data - 圧縮バイト列 @param options - 検証済みの展開設定 */
  constructor(
    private readonly data: Uint8Array,
    private readonly options: {
      readonly earlyChange: EarlyChange;
      readonly maxDecompressedSize: number;
    },
  ) {
    this.output = new Uint8Array(
      Math.min(INITIAL_BUFFER_SIZE, options.maxDecompressedSize),
    );
  }

  /** @returns EOD まで展開したバイト列、または破損・上限超過エラー */
  decode(): Result<Uint8Array, PdfParseError> {
    while (true) {
      const code = this.readCode();
      if (!code.some) {
        return failLzw("LZW stream is missing EOD or has a truncated code");
      }
      if (code.value === EOD) {
        return ok(this.output.slice(0, this.outputLength));
      }
      if (code.value === CLEAR_TABLE) {
        this.resetTable();
        continue;
      }
      const error = this.appendCode(code.value);
      if (error.some) {
        return err(error.value);
      }
    }
  }

  /** @returns MSB 順の次のコード、残りのビットが足りなければ None */
  private readCode(): Option<number> {
    if (this.bitOffset + this.codeWidth > this.data.length * BITS_PER_BYTE) {
      return none;
    }
    let value = 0;
    for (let remaining = this.codeWidth; remaining > 0; ) {
      const withinByte = this.bitOffset % BITS_PER_BYTE;
      const count = Math.min(remaining, BITS_PER_BYTE - withinByte);
      const byte = this.data[Math.floor(this.bitOffset / BITS_PER_BYTE)];
      const shift = BITS_PER_BYTE - withinByte - count;
      value = (value << count) | ((byte >> shift) & ((1 << count) - 1));
      this.bitOffset += count;
      remaining -= count;
    }
    return some(value);
  }

  /** 辞書とコード幅を初期化し、圧縮データのビット位置は維持する。 */
  private resetTable(): void {
    this.nextCode = FIRST_DICTIONARY_CODE;
    this.codeWidth = INITIAL_CODE_WIDTH;
    this.previousCode = none;
  }

  /** @param code - 通常コード @returns 不正コードまたは上限超過ならエラー */
  private appendCode(code: number): Option<PdfParseError> {
    const isNextCode = code === this.nextCode;
    const invalidCode =
      code > this.nextCode || (isNextCode && !this.previousCode.some);
    if (invalidCode) {
      return some({
        code: "LZWDECODE_FAILED",
        message: `Invalid LZW code: ${code}`,
      });
    }

    const sourceCode =
      isNextCode && this.previousCode.some ? this.previousCode.value : code;
    const sequenceLength = this.readSequence(sourceCode);
    const firstByte = this.sequence[sequenceLength - 1];
    const length = sequenceLength + (isNextCode ? 1 : 0);
    if (length > this.options.maxDecompressedSize - this.outputLength) {
      return some({
        code: "LZWDECODE_FAILED",
        message: `Decompressed size exceeds limit of ${this.options.maxDecompressedSize} bytes`,
      });
    }

    this.reserveOutput(length);
    for (let index = sequenceLength - 1; index >= 0; index--) {
      this.output[this.outputLength++] = this.sequence[index];
    }
    if (isNextCode) {
      this.output[this.outputLength++] = firstByte;
    }
    this.addDictionaryCode(firstByte);
    this.previousCode = some(code);
    return none;
  }

  /** @param code - 登録済みコード @returns 逆順で作業領域に復元した文字列の長さ */
  private readSequence(code: number): number {
    let current = code;
    let length = 0;
    while (current >= FIRST_DICTIONARY_CODE) {
      this.sequence[length++] = this.suffixes[current];
      current = this.prefixes[current];
    }
    this.sequence[length++] = current;
    return length;
  }

  /** @param firstByte - 今回の文字列の先頭バイト */
  private addDictionaryCode(firstByte: number): void {
    if (!this.previousCode.some) {
      return;
    }
    if (this.nextCode === TABLE_SIZE) {
      return;
    }
    this.prefixes[this.nextCode] = this.previousCode.value;
    this.suffixes[this.nextCode] = firstByte;
    this.nextCode++;
    const shouldGrow =
      this.codeWidth < MAX_CODE_WIDTH &&
      this.nextCode + this.options.earlyChange === 1 << this.codeWidth;
    if (shouldGrow) {
      this.codeWidth++;
    }
  }

  /** @param length - 追加する出力バイト数 */
  private reserveOutput(length: number): void {
    const required = this.outputLength + length;
    if (required <= this.output.length) {
      return;
    }
    const capacity = Math.min(
      Math.max(required, this.output.length * 2),
      this.options.maxDecompressedSize,
    );
    const next = new Uint8Array(capacity);
    next.set(this.output.subarray(0, this.outputLength));
    this.output = next;
  }
}

/** PDF の LZW 符号列を展開する。Predictor は FlateDecode 同様に呼び出し側で適用する。 */
export const LzwDecode = {
  /**
   * MSB 順の9〜12ビットコードを EOD まで展開する。
   * @param data - LZW 圧縮データ
   * @param options - DecodeParms と展開サイズ上限
   * @returns 展開バイト列、パラメータ不正・破損・上限超過ならエラー
   */
  decode(
    data: Uint8Array,
    options: LzwDecodeOptions = {},
  ): Result<Uint8Array, PdfParseError> {
    const earlyChange = EarlyChange.parse(options.decodeParms);
    if (!earlyChange.ok) {
      return earlyChange;
    }
    const maxDecompressedSize =
      options.maxDecompressedSize ?? DEFAULT_MAX_DECOMPRESSED_SIZE;
    if (!NumberEx.isPositiveSafeInteger(maxDecompressedSize)) {
      return failLzw(
        "Invalid maxDecompressedSize: must be a finite, positive safe integer",
      );
    }
    return new LzwDecoder(data, {
      earlyChange: earlyChange.value,
      maxDecompressedSize,
    }).decode();
  },
} as const;
