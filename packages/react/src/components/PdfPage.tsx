import type React from "react";

export interface PdfPageProps {
  pageNumber: number;
  width?: number;
  height?: number;
}

/**
 * Renders a single PDF page.
 * Currently a placeholder — will be implemented with canvas rendering.
 */
export const PdfPage: React.FC<PdfPageProps> = ({
  pageNumber,
  width = 612,
  height = 792,
}) => {
  return (
    <div
      data-testid="pdf-page"
      data-page-number={pageNumber}
      style={{
        width,
        height,
        border: "1px solid #ccc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
      }}
    >
      <span>Page {pageNumber}</span>
    </div>
  );
};
