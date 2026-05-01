import { isPdfWhitespace, matchesBytesAt } from "../lexer/bytes/index";
import type { ObjectStore } from "../objects/object-store/index";
import type { PdfError, PdfParseError, PdfWarning } from "../pdf/errors/index";
import { ByteOffset } from "../pdf/types/index";
import { PdfVersion } from "../pdf/version/index";
import { fromNullable, type Option } from "../utils/option/index";
import { err, ok, type Result } from "../utils/result/index";
import type { DocumentMetadata } from "./document-metadata";
import type { ResolvedPage } from "./page-tree/resolved-page";

const PDF_HEADER_SIGNATURE: number[] = Array.from(
  new TextEncoder().encode("%PDF-"),
);
const HEADER_SCAN_LIMIT = 1024;
const VERSION_MAX_LEN = 8;

/**
 * `data` の先頭 `HEADER_SCAN_LIMIT` バイト以内で `%PDF-` の位置を探す。
 *
 * @param data - PDF のバイト列
 * @returns 見つかれば 0 以上のオフセット、見つからなければ -1
 */
const findHeaderOffset = (data: Uint8Array): number => {
  const scanEnd = Math.min(data.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i <= scanEnd - PDF_HEADER_SIGNATURE.length; i++) {
    if (matchesBytesAt(data, i, PDF_HEADER_SIGNATURE)) {
      return i;
    }
  }
  return -1;
};

/**
 * PDF ヘッダ (`%PDF-x.y`) を検証して `PdfVersion` を返す。
 *
 * @param data - PDF のバイト列
 * @returns ヘッダが有効なら `Ok<PdfVersion>`、不正なら `Err<PdfParseError>`
 */
const verifyHeader = (data: Uint8Array): Result<PdfVersion, PdfParseError> => {
  if (data.length < PDF_HEADER_SIGNATURE.length) {
    return err({
      code: "INVALID_HEADER",
      message: "PDF data too short to contain %PDF- header",
      offset: ByteOffset.of(0),
    });
  }

  const headerOffset = findHeaderOffset(data);
  if (headerOffset < 0) {
    return err({
      code: "INVALID_HEADER",
      message: `%PDF- signature not found in first ${HEADER_SCAN_LIMIT} bytes`,
      offset: ByteOffset.of(0),
    });
  }

  // signature 直後から PDF whitespace (NUL/TAB/LF/FF/CR/SPACE) までを
  // version 文字列として読み取る。
  const versionStart = headerOffset + PDF_HEADER_SIGNATURE.length;
  let versionEnd = versionStart;
  while (
    versionEnd < data.length &&
    versionEnd - versionStart < VERSION_MAX_LEN &&
    !isPdfWhitespace(data[versionEnd])
  ) {
    versionEnd++;
  }
  const versionStr = new TextDecoder("ascii").decode(
    data.subarray(versionStart, versionEnd),
  );

  const created = PdfVersion.create(versionStr);
  if (!created.ok) {
    return err({
      code: "INVALID_HEADER",
      message: `Unknown PDF version: "${versionStr}"`,
      offset: ByteOffset.of(headerOffset),
    });
  }
  return ok(created.value);
};

/**
 * `PdfDocument.load` が返しうるエラーの判別共用体。
 * - {@link PdfError}: PDF 構造に由来する致命的エラー
 * - `RangeError`: 入力サイズや索引の境界違反
 */
export type PdfDocumentLoadError = PdfError | RangeError;

/**
 * `PdfDocument.load` 呼び出し時のオプション。
 */
export interface LoadOptions {
  /** ObjectStore のキャッシュ容量上限（未指定時は実装側のデフォルト） */
  readonly cacheCapacity?: number;
  /** 回復可能な警告を受け取るコールバック */
  readonly onWarning?: (warning: PdfWarning) => void;
}

/**
 * `PdfDocument` の private constructor が instance に assign する fields。
 * 公開 API ではないため `internal` 扱いで、PR-3 の本実装で使用する。
 */
interface PdfDocumentFields {
  readonly version: PdfVersion;
  readonly pages: readonly ResolvedPage[];
  readonly metadata: DocumentMetadata;
  readonly resolver: ObjectStore;
}

/**
 * PDF ドキュメントを表すエンティティ。
 *
 * 本クラスは PR-2 時点でも本体未実装で、`load` は `verifyHeader` が
 * Ok を返した場合でも下流が未実装のため `NOT_IMPLEMENTED` Err を返す。
 * Cycle 1 (PR-2) では `verifyHeader` 部分のみ実装し、L-001 系
 * (`INVALID_HEADER`) を担保する。
 */
export class PdfDocument {
  readonly version!: PdfVersion;
  readonly pageCount: number = 0;
  readonly metadata!: DocumentMetadata;
  readonly resolver!: ObjectStore;
  readonly #pages: readonly ResolvedPage[] = [];

  private constructor(_fields: PdfDocumentFields) {
    // PR-3 で fields を assign する。skeleton では直接呼び出されない。
  }

  /**
   * PDF バイト列を読み込み、`PdfDocument` を構築する。
   *
   * @param data - PDF のバイト列
   * @param _options - 読み込みオプション
   * @returns 成功時は `Ok<PdfDocument>`、失敗時は `Err<PdfDocumentLoadError>`
   */
  static async load(
    data: Uint8Array,
    _options?: LoadOptions,
  ): Promise<Result<PdfDocument, PdfDocumentLoadError>> {
    const headerResult = verifyHeader(data);
    if (!headerResult.ok) {
      return headerResult;
    }

    return err({
      code: "NOT_IMPLEMENTED",
      message: "PdfDocument.load is not yet implemented",
    });
  }

  /**
   * 指定インデックスのページを取得する。
   *
   * @param index - 0-origin のページインデックス
   * @returns 該当ページがあれば `Some<ResolvedPage>`、なければ `None`
   */
  getPage(index: number): Option<ResolvedPage> {
    return fromNullable(this.#pages[index]);
  }
}
