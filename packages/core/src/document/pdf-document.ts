import type { ObjectStore } from "../objects/object-store/index";
import type { PdfError, PdfWarning } from "../pdf/errors/index";
import type { PdfVersion } from "../pdf/version/index";
import { fromNullable, type Option } from "../utils/option/index";
import { err, type Result } from "../utils/result/index";
import type { DocumentMetadata } from "./document-metadata";
import type { ResolvedPage } from "./page-tree/resolved-page";

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
 * `PdfDocument` の private constructor に渡す初期化情報。
 * 公開 API ではないため `internal` 扱いで、PR-3 の本実装で使用する。
 */
interface PdfDocumentInit {
  readonly version: PdfVersion;
  readonly pages: readonly ResolvedPage[];
  readonly metadata: DocumentMetadata;
  readonly resolver: ObjectStore;
}

/**
 * PDF ドキュメントを表すエンティティ。
 *
 * 本クラスは PR-1 時点では skeleton 実装であり、`load` は常に
 * `NOT_IMPLEMENTED` Err、`getPage` は空配列を参照して `None` を返す。
 * `INVALID_HEADER` を意図的に返さないのは、PR-2 の Red テスト (T-010)
 * が「空入力 → `INVALID_HEADER`」を期待して fail を観察できるようにするため。
 */
export class PdfDocument {
  readonly version!: PdfVersion;
  readonly pageCount: number = 0;
  readonly metadata!: DocumentMetadata;
  readonly resolver!: ObjectStore;
  readonly #pages: readonly ResolvedPage[] = [];

  private constructor(_init: PdfDocumentInit) {
    // PR-3 で fields を assign する。skeleton では直接呼び出されない。
  }

  /**
   * PDF バイト列を読み込み、`PdfDocument` を構築する。
   *
   * @param _data - PDF のバイト列
   * @param _options - 読み込みオプション
   * @returns 成功時は `Ok<PdfDocument>`、失敗時は `Err<PdfDocumentLoadError>`
   */
  static async load(
    _data: Uint8Array,
    _options?: LoadOptions,
  ): Promise<Result<PdfDocument, PdfDocumentLoadError>> {
    return err({
      code: "NOT_IMPLEMENTED",
      message: "PdfDocument.load is not yet implemented",
    });
  }

  /**
   * 指定インデックスのページを取得する。
   *
   * @param _index - 0-origin のページインデックス
   * @returns 該当ページがあれば `Some<ResolvedPage>`、なければ `None`
   */
  getPage(index: number): Option<ResolvedPage> {
    return fromNullable(this.#pages[index]);
  }
}
