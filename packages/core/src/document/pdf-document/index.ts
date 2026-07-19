import { isPdfWhitespace, matchesBytesAt } from "../../lexer/bytes/index";
import { ObjectParser } from "../../objects/object-parser/index";
import { ObjectStore } from "../../objects/object-store/index";
import type {
  PdfError,
  PdfParseError,
  PdfWarning,
} from "../../pdf/errors/index";
import { PdfFilter } from "../../pdf/filter/index";
import {
  ByteOffset,
  PdfType,
  type PdfValue,
  type TrailerDict,
  type XRefTable,
} from "../../pdf/types/index";
import { PdfVersion } from "../../pdf/version/index";
import { none, type Option, some } from "../../utils/option/index";
import { err, ok, type Result } from "../../utils/result/index";
import { scanFallback } from "../../xref/fallback/index";
import { mergeXRefChain } from "../../xref/merger/index";
import { scanStartXRef } from "../../xref/startxref/index";
import {
  decodeXRefStreamEntries,
  decompressFlate,
} from "../../xref/stream/index";
import { buildXRefStreamTrailerDict } from "../../xref/stream/trailer/index";
import { parseXRefTable } from "../../xref/table/index";
import { parseTrailer } from "../../xref/trailer/index";
import { CatalogParser, type ResolveRef } from "../catalog/catalog-parser";
import { DocumentInfoParser } from "../metadata/document-info-parser";
import type { DocumentMetadata } from "../metadata/document-metadata";
import { PageTreeWalker } from "../page-tree/page-tree-walker";
import type { ResolvedPage } from "../page-tree/resolved-page";

const PDF_HEADER_SIGNATURE: number[] = Array.from(
  new TextEncoder().encode("%PDF-"),
);
// PDF仕様上の規定ではなく、Adobe実装ノートで一般的に使われる慣行値。
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

const XREF_KEYWORD_BYTES: number[] = Array.from(
  new TextEncoder().encode("xref"),
);
const XREF_STREAM_W_LENGTH = 3;

/**
 * 指定オフセットから xref テーブルと trailer 辞書を続けて解析する
 * （テキスト形式 xref。`xref` キーワードから始まる区間専用）。
 *
 * @param data - PDF のバイト列
 * @param offset - xref キーワードのバイトオフセット
 * @returns 成功時は `Ok<{ xref, trailer }>`、失敗時は `Err<PdfParseError>`
 */
const parseTextXRefAt = (
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

interface XRefStreamLayout {
  readonly w: readonly [number, number, number];
  readonly size: number;
  readonly index?: readonly number[];
}

/**
 * PdfValue の配列から整数配列を読み取る。要素が1つでも整数でなければ `undefined`。
 *
 * @param value - 読み取り対象の PdfValue
 * @returns 整数配列、または形状が一致しない場合は `undefined`
 */
const readIntArray = (value: PdfValue | undefined): number[] | undefined => {
  if (value === undefined || value.type !== "array") {
    return undefined;
  }
  const result: number[] = [];
  for (const element of value.elements) {
    if (element.type !== "integer") {
      return undefined;
    }
    result.push(element.value);
  }
  return result;
};

/**
 * xref ストリーム辞書から `/W` `/Size` `/Index` を抽出する
 * （`decodeXRefStreamEntries` の引数を組み立てるための形状検証）。
 *
 * @param entries - xref ストリームの辞書エントリ
 * @param offset - エラー報告用のストリーム開始バイトオフセット
 * @returns 成功時は `Ok<XRefStreamLayout>`、失敗時は `Err<PdfParseError>` (コード: XREF_STREAM_INVALID)
 */
const readXRefStreamLayout = (
  entries: ReadonlyMap<string, PdfValue>,
  offset: ByteOffset,
): Result<XRefStreamLayout, PdfParseError> => {
  const w = readIntArray(entries.get("W"));
  if (w === undefined || w.length !== XREF_STREAM_W_LENGTH) {
    return err({
      code: "XREF_STREAM_INVALID",
      message: "invalid /W array in xref stream",
      offset,
    });
  }

  const sizeEntry = entries.get("Size");
  if (sizeEntry === undefined || sizeEntry.type !== "integer") {
    return err({
      code: "XREF_STREAM_INVALID",
      message: "invalid /Size in xref stream",
      offset,
    });
  }

  if (!entries.has("Index")) {
    return ok({ w: [w[0], w[1], w[2]], size: sizeEntry.value });
  }
  const index = readIntArray(entries.get("Index"));
  if (index === undefined) {
    return err({
      code: "XREF_STREAM_INVALID",
      message: "invalid /Index array in xref stream",
      offset,
    });
  }

  return ok({ w: [w[0], w[1], w[2]], size: sizeEntry.value, index });
};

/**
 * 指定オフセットの間接オブジェクトを xref ストリームとして解析する
 * （`N G obj << /Type /XRef ... >> stream ... endstream` 区間専用）。
 * `/Filter` が `/FlateDecode` なら展開してからエントリをデコードする。
 * Predictor 逆変換は未実装のため、`/DecodeParms` を持つストリームは
 * 誤ったエントリを静かに生成しないよう `XREF_STREAM_INVALID` で拒否する。
 *
 * @param data - PDF のバイト列
 * @param offset - 間接オブジェクトの開始バイトオフセット
 * @returns 成功時は `Ok<{ xref, trailer }>`、失敗時は `Err<PdfError>`
 */
const parseStreamXRefAt = async (
  data: Uint8Array,
  offset: ByteOffset,
): Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>> => {
  const objectResult = await ObjectParser.parseIndirectObject(data, offset);
  if (!objectResult.ok) {
    return objectResult;
  }
  const body = objectResult.value.body;
  if (body.type !== "stream") {
    return err({
      code: "XREF_STREAM_INVALID",
      message: "startxref/Prev offset does not point to a stream object",
      offset,
    });
  }

  const typeCheck = PdfType.validate(body.dictionary.entries, "XRef");
  if (typeCheck.some) {
    return err(typeCheck.value);
  }

  if (body.dictionary.entries.has("DecodeParms")) {
    return err({
      code: "XREF_STREAM_INVALID",
      message:
        "/DecodeParms (e.g. Predictor) is not supported for xref streams",
      offset,
    });
  }

  const layoutResult = readXRefStreamLayout(body.dictionary.entries, offset);
  if (!layoutResult.ok) {
    return layoutResult;
  }

  const filterResult = PdfFilter.parse(body.dictionary.entries);
  if (!filterResult.ok) {
    return filterResult;
  }

  let decoded = body.data;
  if (filterResult.value === "FlateDecode") {
    const decompressResult = await decompressFlate(body.data);
    if (!decompressResult.ok) {
      return decompressResult;
    }
    decoded = decompressResult.value;
  }

  const xrefResult = decodeXRefStreamEntries({
    data: decoded,
    w: layoutResult.value.w,
    size: layoutResult.value.size,
    index: layoutResult.value.index,
    baseOffset: offset,
  });
  if (!xrefResult.ok) {
    return xrefResult;
  }

  const trailerResult = buildXRefStreamTrailerDict(body.dictionary.entries);
  if (!trailerResult.ok) {
    return trailerResult;
  }

  return ok({ xref: xrefResult.value, trailer: trailerResult.value });
};

/**
 * 指定オフセットの xref セクションを解析する。先頭が `xref` キーワードなら
 * テキスト形式、そうでなければ xref ストリーム（間接オブジェクト）として
 * 解析する（ISO 32000-1 §7.5.8, XM-004）。`mergeXRefChain` の
 * `parseCallback` 引数として使う。
 *
 * @param data - PDF のバイト列
 * @param offset - xref セクションの開始バイトオフセット
 * @returns 成功時は `Ok<{ xref, trailer }>`、失敗時は `Err<PdfError>`
 */
const parseXRefAt = async (
  data: Uint8Array,
  offset: ByteOffset,
): Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>> => {
  if (matchesBytesAt(data, offset, XREF_KEYWORD_BYTES)) {
    return parseTextXRefAt(data, offset);
  }
  return parseStreamXRefAt(data, offset);
};

/** PdfWarning 配列を消費するローカルコールバック型。 */
type EmitWarnings = (warnings: readonly PdfWarning[]) => void;

/**
 * startxref → /Prev チェーンマージ → 失敗時は scanFallback の順で
 * xref テーブルと trailer 辞書を解決する。
 *
 * - `scanStartXRef` Err / `mergeXRefChain` Err のいずれか発生時のみ
 *   `scanFallback` を呼び、成功した警告は `emitWarnings` で通知する。
 * - fallback でも trailer を再構築できなければ `ROOT_NOT_FOUND` を返す。
 *
 * @param data - PDF のバイト列
 * @param emitWarnings - fallback 復元時の警告通知コールバック
 * @returns 成功時は `Ok<{ xref, trailer }>`、失敗時は `Err<PdfError>`
 */
const resolveXRefStructure = async (
  data: Uint8Array,
  emitWarnings: EmitWarnings,
): Promise<Result<{ xref: XRefTable; trailer: TrailerDict }, PdfError>> => {
  const startXRefResult = scanStartXRef(data);
  if (!startXRefResult.ok) {
    const fb = scanFallback(data);
    if (!fb.ok) {
      return fb;
    }
    if (!fb.value.trailer.some) {
      return err({
        code: "ROOT_NOT_FOUND",
        message: "fallback xref scan could not reconstruct trailer",
        offset: ByteOffset.of(0),
      });
    }
    emitWarnings(fb.value.warnings);
    return ok({ xref: fb.value.xrefTable, trailer: fb.value.trailer.value });
  }

  const mergeResult = await mergeXRefChain(startXRefResult.value, (off) =>
    parseXRefAt(data, off),
  );
  if (mergeResult.ok) {
    return ok({
      xref: mergeResult.value.mergedXRef,
      trailer: mergeResult.value.latestTrailer,
    });
  }

  const fb = scanFallback(data);
  if (!fb.ok) {
    return fb;
  }
  if (!fb.value.trailer.some) {
    return mergeResult;
  }
  emitWarnings(fb.value.warnings);
  return ok({ xref: fb.value.xrefTable, trailer: fb.value.trailer.value });
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
 * `scanStartXRef` / `mergeXRefChain` の失敗時は `scanFallback` で
 * xref/trailer の再構築を試み、復元できた場合は `XREF_REBUILD`
 * 警告を `onWarning` に通知してから処理を続行する。
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

    /**
     * `options.onWarning` が登録されていれば各警告を順に通知する。
     * 未登録なら早期 return で配列イテレーションを省く。
     *
     * @param warnings - 通知対象の警告配列
     */
    const emitWarnings: EmitWarnings = (warnings) => {
      if (!options?.onWarning) {
        return;
      }
      for (const w of warnings) {
        options.onWarning(w);
      }
    };

    const xrefResolution = await resolveXRefStructure(data, emitWarnings);
    if (!xrefResolution.ok) {
      return xrefResolution;
    }
    const { xref, trailer: latestTrailer } = xrefResolution.value;

    if (latestTrailer.encrypt !== undefined) {
      return err({
        code: "ENCRYPTED_PDF_UNSUPPORTED",
        message: "encrypted PDF is not supported",
        offset: ByteOffset.of(0),
      });
    }

    const storeResult = ObjectStore.create(
      { xref, data },
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
    emitWarnings(catalogResult.value.warnings);

    const walkResult = await PageTreeWalker.walk(
      catalogResult.value.pagesRef,
      resolveRef,
    );
    if (!walkResult.ok) {
      return walkResult;
    }
    emitWarnings(walkResult.value.warnings);

    const infoResult = await DocumentInfoParser.parse(
      latestTrailer,
      resolveRef,
    );
    if (!infoResult.ok) {
      return infoResult;
    }
    emitWarnings(infoResult.value.warnings);

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
