/**
 * xref テーブル/ストリームが破損・欠落している場合に、ファイル全体を走査してオブジェクトを復元する `scanFallback` を公開するバレル。
 *
 * @module
 */

export type { FallbackScanResult } from "./fallback-scanner";
export { scanFallback } from "./fallback-scanner";
