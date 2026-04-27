export type { ParsedCatalog, ResolveRef } from "./catalog-parser";
export { CatalogParser } from "./catalog-parser";
export type { ParsedDocumentInfo } from "./document-info-parser";
export { DocumentInfoParser } from "./document-info-parser";
export type { DocumentMetadata } from "./document-metadata";
export { PdfTrapped } from "./document-metadata";
export type {
  InheritedAttrs,
  PageRotate,
  PdfRectangle,
  ResolvedPage,
  ResolveInheritedOutcome,
  WalkPageTreeResult,
} from "./page-tree/index";
export { InheritanceResolver, PageTreeWalker } from "./page-tree/index";
