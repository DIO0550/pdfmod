import { isPdfWhitespace, matchesBytesAt } from "../lexer/bytes/index";
import { ObjectStore } from "../objects/object-store/index";
import type { PdfError, PdfParseError, PdfWarning } from "../pdf/errors/index";
import type { TrailerDict, XRefTable } from "../pdf/types/index";
import { ByteOffset } from "../pdf/types/index";
import { PdfVersion } from "../pdf/version/index";
import { none, type Option, some } from "../utils/option/index";
import { err, ok, type Result } from "../utils/result/index";
import { mergeXRefChain } from "../xref/merger/index";
import { scanStartXRef } from "../xref/startxref/index";
import { parseXRefTable } from "../xref/table/index";
import { parseTrailer } from "../xref/trailer/index";
import { CatalogParser, type ResolveRef } from "./catalog-parser";
import { DocumentInfoParser } from "./document-info-parser";
import type { DocumentMetadata } from "./document-metadata";
import { PageTreeWalker } from "./page-tree/page-tree-walker";
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
 * version 文字列の終端位置を返す。
 * `versionStart` から最大 `VERSION_MAX_LEN` バイト以内で、
 * 最初に現れる PDF whitespace の位置 (見つからなければ走査上限) を返す。
 *
 * @param data - PDF のバイト列
 * @param versionStart - signature 直後の version 文字列開始位置
 * @returns version 文字列の終端 (whitespace の位置、または走査上限)
 */
const findVersionEnd = (data: Uint8Array, versionStart: number): number => {
  const scanLimit = Math.min(data.length, versionStart + VERSION_MAX_LEN);
  for (let i = versionStart; i < scanLimit; i++) {
    if (isPdfWhitespace(data[i])) {
      return i;
    }
  }
  return scanLimit;
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
  const versionEnd = findVersionEnd(data, versionStart);
  const versionStr = new TextDecoder("ascii").decode(
    data.subarray(versionStart, versionEnd),
  );

  const created = PdfVersion.create(versionStr);
  if (!created.ok) {
    return err({
      code: "INVALID_HEADER",
      message: `Invalid PDF version "${versionStr}": ${created.error}`,
      offset: ByteOffset.of(versionStart),
    });
  }
  return ok(created.value);
};

/**
 * 指定オフセットから xref テーブルと trailer 辞書を続けて解析する。
 * `mergeXRefChain` の `parseCallback` 引数として使う合成。
 *
 * @param data - PDF のバイト列
 * @param offset - xref キーワードのバイトオフセット
 * @returns 成功時は `Ok<{ xref, trailer }>`、失敗時は `Err<PdfParseError>`
 */
const parseXRefAt = (
  data: Uint8Array,
  offset: ByteOffset,
): Result<{ xref: XRefTable; trailer: TrailerDict }, PdfParseError> => {
  const tableResult = parseXRefTable(data, offset);
  if (!tableResult.ok) {
    return tableResult;
  }
  const trailerResult = parseTrailer(data, tableResult.value.trailerOffset);
  if (!trailerResult.ok) {
    return trailerResult;
  }
  return ok({
    xref: tableResult.value.xref,
    trailer: trailerResult.value,
  });
};

/**
 * `data` から startxref 走査と /Prev チェーンマージを行い、
 * 統合済み xref と最新 trailer 辞書を返す。
 *
 * @param data - PDF のバイト列
 * @returns 成功時は `Ok<{ mergedXRef, latestTrailer }>`、失敗時は `Err<PdfParseError>`
 */
const loadXRefStructure = (
  data: Uint8Array,
): Result<
  { mergedXRef: XRefTable; latestTrailer: TrailerDict },
  PdfParseError
> => {
  const startXRefResult = scanStartXRef(data);
  if (!startXRefResult.ok) {
    return startXRefResult;
  }
  return mergeXRefChain(startXRefResult.value, (off) => parseXRefAt(data, off));
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
 */
interface PdfDocumentFields {
  readonly version: PdfVersion;
  readonly pages: readonly ResolvedPage[];
  readonly metadata: DocumentMetadata;
  readonly resolver: ObjectStore;
}

/**
 * PDF ドキュメントを表すエンティティ。
 * `load` は ヘッダ検証 → startxref 走査 → xref/trailer 解析 → ObjectStore 生成
 * → カタログ解析 → ページツリー走査 → /Info メタデータ抽出 を直列に実行する。
 *
 * fallback 経路と onWarning 通知は本 PR では未実装で、後続 PR で追加する。
 */
export class PdfDocument {
  readonly version: PdfVersion;
  readonly pageCount: number;
  readonly metadata: DocumentMetadata;
  readonly resolver: ObjectStore;
  readonly #pages: readonly ResolvedPage[];

  private constructor(fields: PdfDocumentFields) {
    this.version = fields.version;
    this.metadata = fields.metadata;
    this.resolver = fields.resolver;
    this.#pages = fields.pages;
    this.pageCount = fields.pages.length;
  }

  /**
   * PDF バイト列を読み込み、`PdfDocument` を構築する。
   *
   * @param data - PDF のバイト列
   * @param options - 読み込みオプション
   * @returns 成功時は `Ok<PdfDocument>`、失敗時は `Err<PdfDocumentLoadError>`
   */
  static async load(
    data: Uint8Array,
    options?: LoadOptions,
  ): Promise<Result<PdfDocument, PdfDocumentLoadError>> {
    const headerResult = verifyHeader(data);
    if (!headerResult.ok) {
      return headerResult;
    }
    const headerVersion = headerResult.value;

    const xrefResult = loadXRefStructure(data);
    if (!xrefResult.ok) {
      return xrefResult;
    }
    const { mergedXRef, latestTrailer } = xrefResult.value;

    const storeResult = ObjectStore.create(
      { xref: mergedXRef, data },
      { cacheCapacity: options?.cacheCapacity },
    );
    if (!storeResult.ok) {
      return storeResult;
    }
    const store = storeResult.value;

    const resolveRef: ResolveRef = (ref) => store.get(ref);

    const catalogResult = await CatalogParser.parse(
      latestTrailer,
      headerVersion,
      resolveRef,
    );
    if (!catalogResult.ok) {
      return catalogResult;
    }

    const walkResult = await PageTreeWalker.walk(
      catalogResult.value.pagesRef,
      resolveRef,
    );
    if (!walkResult.ok) {
      return walkResult;
    }
    for (const w of walkResult.value.warnings) {
      options?.onWarning?.(w);
    }

    const infoResult = await DocumentInfoParser.parse(
      latestTrailer,
      resolveRef,
    );
    if (!infoResult.ok) {
      return infoResult;
    }
    for (const w of infoResult.value.warnings) {
      options?.onWarning?.(w);
    }

    return ok(
      new PdfDocument({
        version: catalogResult.value.version,
        pages: walkResult.value.pages,
        metadata: infoResult.value.metadata,
        resolver: store,
      }),
    );
  }

  /**
   * 指定インデックスのページを取得する。
   *
   * @param index - 0-origin のページインデックス
   * @returns 該当ページがあれば `Some<ResolvedPage>`、なければ `None`
   */
  getPage(index: number): Option<ResolvedPage> {
    if (!Number.isInteger(index)) {
      return none;
    }
    if (index < 0) {
      return none;
    }
    if (index >= this.#pages.length) {
      return none;
    }
    return some(this.#pages[index]);
  }
}
