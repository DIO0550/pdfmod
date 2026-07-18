/**
 * `/Info` 辞書の解析（`DocumentInfoParser`）とメタデータ型（`DocumentMetadata`, `PdfTrapped`）を公開するバレル。
 *
 * @module
 */

export type { ParsedDocumentInfo } from "./document-info-parser";
export { DocumentInfoParser } from "./document-info-parser";
export type { DocumentMetadata } from "./document-metadata";
export { PdfTrapped, parseTrappedName } from "./document-metadata";
