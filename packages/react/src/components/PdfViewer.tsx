import type React from "react";
import { usePdfDocument } from "../hooks/usePdfDocument.js";
import { PdfPage } from "./PdfPage.js";

/**
 * PDFビューアコンポーネントのProps。
 *
 * @example
 * ```tsx
 * <PdfViewer source="https://example.com/doc.pdf" className="viewer" />
 * ```
 */
export interface PdfViewerProps {
  /** PDFソース（URL文字列、Uint8Arrayバイナリ、またはnull） */
  source: string | Uint8Array | null;
  /** ルート要素に適用するCSSクラス名 */
  className?: string;
}

/**
 * PDFビューアコンポーネント。
 * ローディング・エラー状態を表示し、読み込み完了後にページを描画する。
 * 現在はプレースホルダ実装。
 *
 * @param props - {@link PdfViewerProps}
 * @returns ローディング、エラー、空、またはページ表示のReact要素
 *
 * @example
 * ```tsx
 * <PdfViewer source={pdfBytes} className="my-viewer" />
 * ```
 */
export const PdfViewer: React.FC<PdfViewerProps> = ({ source, className }) => {
  const { loading, error, data } = usePdfDocument(source);

  if (loading) {
    return (
      <div data-testid="pdf-viewer-loading" className={className}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="pdf-viewer-error" className={className}>
        Error: {error.message}
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="pdf-viewer-empty" className={className}>
        No document loaded
      </div>
    );
  }

  return (
    <div data-testid="pdf-viewer" className={className}>
      <PdfPage pageNumber={1} />
    </div>
  );
};
