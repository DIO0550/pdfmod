import type { Brand } from "../../utils/brand/index";
import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";

declare const PdfVersionBrand: unique symbol;

/**
 * PDF バージョン番号を表すブランド型。
 * `PdfVersion.create` を通じてのみ構築可能で、ISO 32000-1/2 の既定バージョンのみ受理する。
 */
type PdfVersion = Brand<string, typeof PdfVersionBrand>;

const VERSION_PATTERN = /^(\d+)\.(\d+)$/;

/**
 * ISO 32000-1:2008 (1.0〜1.7) および ISO 32000-2:2020 (2.0) が規定する
 * サポート済み PDF バージョンの allowlist。将来の ISO 改訂で追加する。
 */
const SUPPORTED_PDF_VERSIONS: ReadonlySet<string> = new Set([
  "1.0",
  "1.1",
  "1.2",
  "1.3",
  "1.4",
  "1.5",
  "1.6",
  "1.7",
  "2.0",
]);

/**
 * ブランド保証された `PdfVersion` を major / minor に分解する内部ヘルパー。
 * `create` 経由でしか `PdfVersion` を構築できないため、パターンマッチは必ず成立する。
 *
 * @param v - 検証済み PdfVersion
 * @returns major と minor の整数ペア
 */
const parseUnchecked = (v: PdfVersion): { major: number; minor: number } => {
  const match = VERSION_PATTERN.exec(v as string);
  if (match === null) {
    return { major: 0, minor: 0 };
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
};

const PdfVersion = {
  /**
   * 文字列から `PdfVersion` を構築する。
   *
   * @param s - `/^\d+\.\d+$/` 形式の文字列
   * @returns 形式が正しければ `Ok<PdfVersion>`、そうでなければ `Err<string>`
   */
  create(s: string): Result<PdfVersion, string> {
    if (!VERSION_PATTERN.test(s)) {
      return err(`Invalid PdfVersion: "${s}" (must match /^\\d+\\.\\d+$/)`);
    }

    if (!SUPPORTED_PDF_VERSIONS.has(s)) {
      return err(
        `Unsupported PdfVersion: "${s}" (supported: ${[...SUPPORTED_PDF_VERSIONS].join(", ")})`,
      );
    }

    return ok(s as PdfVersion);
  },

  /**
   * 2 つの `PdfVersion` を比較する。
   *
   * @param a - 比較元
   * @param b - 比較先
   * @returns `a - b` の符号（負なら a < b、0 なら同値、正なら a > b）
   */
  compare(a: PdfVersion, b: PdfVersion): number {
    const pa = parseUnchecked(a);
    const pb = parseUnchecked(b);

    if (pa.major !== pb.major) {
      return pa.major - pb.major;
    }

    return pa.minor - pb.minor;
  },
} as const;

export { PdfVersion };
