import React from "react";
import { PdfPage } from "./PdfPage.js";
import { usePdfDocument } from "../hooks/usePdfDocument.js";

export interface PdfViewerProps {
  source: string | Uint8Array | null;
  className?: string;
}

/**
 * PDF viewer component.
 * Currently a placeholder — renders loading/error states and a single page stub.
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
