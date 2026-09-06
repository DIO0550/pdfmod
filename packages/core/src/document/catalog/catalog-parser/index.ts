import { NumberEx } from "../../../ext/number/index";
import type { PdfError, PdfParseError } from "../../../pdf/errors/error/index";
import type { PdfWarning } from "../../../pdf/errors/warning/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import { PdfType } from "../../../pdf/types/pdf-type/index";
import type {
  IndirectRef,
  PdfDictionary,
  PdfObject,
  PdfValue,
  TrailerDict,
} from "../../../pdf/types/pdf-types/index";
import { PdfVersion } from "../../../pdf/version/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

/**
 * 間接参照を解決する関数型。
 *
 * 契約: この関数は Promise を reject しない。失敗時は必ず `Result.err(PdfError)` を resolve する。
 */
export type ResolveRef = (
  ref: IndirectRef,
) => Promise<Result<PdfObject, PdfError>>;

/**
 * カタログ辞書の解析結果。
 */
export interface ParsedCatalog {
  /** カタログ辞書本体 */
  catalog: PdfDictionary;
  /** `/Pages`（ページツリーのルート）への間接参照 */
  pagesRef: IndirectRef;
  /** 採用 PDF バージョン（ヘッダ / カタログのうち新しい方） */
  version: PdfVersion;
  /**
   * カタログ解析中に検出された回復可能な警告。
   * 呼び出し元からは読み取り専用として扱う（内部生成のみ mutable）。
   */
  warnings: readonly PdfWarning[];
}

/**
 * `PdfType.validate` が返した `PDF_TYPE_INVALID` を、CatalogParser 経由の
 * 外部 API コード `CATALOG_TYPE_INVALID` に書き換える。他コードは素通しする。
 *
 * @param e - 元の PdfParseError
 * @returns 書き換え後の PdfParseError
 */
const mapErr = (e: PdfParseError): PdfParseError => {
  if (e.code === "PDF_TYPE_INVALID") {
    return { ...e, code: "CATALOG_TYPE_INVALID" };
  }
  return e;
};

/**
 * カタログ辞書の `/Pages` エントリを `IndirectRef` に変換する。
 *
 * @param entries - カタログ辞書のエントリ
 * @returns 成功時は `Ok<IndirectRef>`、失敗時は `Err<PdfParseError>`
 */
const extractPagesRef = (
  entries: Map<string, PdfValue>,
): Result<IndirectRef, PdfParseError> => {
  const pages = entries.get("Pages");

  if (pages === undefined) {
    return err({
      code: "PAGES_NOT_FOUND",
      message: "Catalog dictionary missing /Pages",
    });
  }

  if (pages.type !== "indirect-ref") {
    return err({
      code: "PAGES_NOT_FOUND",
      message: "Catalog /Pages must be an indirect reference",
    });
  }

  if (!NumberEx.isSafeIntegerAtLeastZero(pages.generationNumber)) {
    return err({
      code: "PAGES_NOT_FOUND",
      message: "Catalog /Pages has invalid generation number",
    });
  }

  const gen = GenerationNumber.create(pages.generationNumber);

  if (!gen.ok) {
    return err({
      code: "PAGES_NOT_FOUND",
      message: "Catalog /Pages generation number out of range",
    });
  }

  // オブジェクト番号の検証基準は ObjectNumber.create に集約している（#334 / D-7）。
  // production では 0 / 負値 / 非整数は object-parser の folding や手前のガードで
  // 先に弾かれるため、ここは型の不変条件を保証する第二の壁として働く（D-7b）。
  const objNum = ObjectNumber.create(pages.objectNumber);

  if (!objNum.ok) {
    return err({
      code: "PAGES_NOT_FOUND",
      message: "Catalog /Pages has invalid object number",
    });
  }

  return ok({
    objectNumber: objNum.value,
    generationNumber: gen.value,
  });
};

/**
 * `pickNewerVersion` の返却型。
 * 採用バージョンと、発行された警告（あれば）を含む。
 */
interface PickNewerVersionResult {
  version: PdfVersion;
  warnings: readonly PdfWarning[];
}

/**
 * カタログ辞書の `/Version` とヘッダバージョンを比較し、採用するバージョンを決める。
 * `/Version` が name で存在するが `PdfVersion.create` に失敗した場合、
 * `CATALOG_VERSION_INVALID` 警告を含めてヘッダ版へフォールバックする。
 * `/Version` 不在または `type !== "name"` の場合は警告を発行しない。
 *
 * @param entries - カタログ辞書のエントリ
 * @param headerVersion - PDF ヘッダ由来のバージョン
 * @returns 採用バージョンと警告配列。不正な `/Version` name の場合のみ
 *   `warnings` に `CATALOG_VERSION_INVALID` を含む
 */
const pickNewerVersion = (
  entries: Map<string, PdfValue>,
  headerVersion: PdfVersion,
): PickNewerVersionResult => {
  const versionEntry = entries.get("Version");

  if (versionEntry === undefined || versionEntry.type !== "name") {
    return { version: headerVersion, warnings: [] };
  }

  const catalogVersionResult = PdfVersion.create(versionEntry.value);

  if (!catalogVersionResult.ok) {
    return {
      version: headerVersion,
      warnings: [
        {
          code: "CATALOG_VERSION_INVALID",
          message:
            `Catalog /Version '${versionEntry.value}' is not a valid PDF version ` +
            `(${catalogVersionResult.error}); using header version`,
        },
      ],
    };
  }

  const catalogVersion = catalogVersionResult.value;

  if (PdfVersion.compare(catalogVersion, headerVersion) > 0) {
    return { version: catalogVersion, warnings: [] };
  }

  return { version: headerVersion, warnings: [] };
};

/**
 * PDF ドキュメントカタログ（`/Root`）をパースするユーティリティ。
 * ISO 32000-2:2020 § 7.7.3 準拠。
 */
export const CatalogParser = {
  /**
   * トレーラ辞書からドキュメントカタログを解決・検証する。
   *
   * @param trailerDict - trailer parser 出力
   * @param headerVersion - PDF ヘッダ由来のバージョン
   * @param resolveRef - 間接参照解決関数
   * @returns 成功時は `Ok<ParsedCatalog>`、失敗時は `Err<PdfError>`
   */
  async parse(
    trailerDict: TrailerDict,
    headerVersion: PdfVersion,
    resolveRef: ResolveRef,
  ): Promise<Result<ParsedCatalog, PdfError>> {
    const resolved = await resolveRef(trailerDict.root);

    if (!resolved.ok) {
      return resolved;
    }

    if (resolved.value.type !== "dictionary") {
      return err({
        code: "CATALOG_ROOT_NOT_DICTIONARY",
        message: "Catalog /Root did not resolve to a dictionary",
      });
    }

    const catalog = resolved.value;

    const typeError = PdfType.validate(catalog.entries, "Catalog");

    if (typeError.some) {
      return err(mapErr(typeError.value));
    }

    const pagesRefResult = extractPagesRef(catalog.entries);

    if (!pagesRefResult.ok) {
      return pagesRefResult;
    }

    const { version, warnings } = pickNewerVersion(
      catalog.entries,
      headerVersion,
    );

    return ok({
      catalog,
      pagesRef: pagesRefResult.value,
      version,
      warnings,
    });
  },
} as const;
