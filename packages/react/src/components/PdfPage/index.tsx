import type React from "react";

/**
 * PDFページコンポーネントのProps。
 *
 * @example
 * ```tsx
 * <PdfPage pageNumber={1} width={800} height={600} />
 * ```
 */
export interface PdfPageProps {
  /** 表示するページ番号（1始まり） */
  pageNumber: number;
  /** ページの幅（ピクセル、デフォルト: 612） */
  width?: number;
  /** ページの高さ（ピクセル、デフォルト: 792） */
  height?: number;
}

/**
 * 単一のPDFページを描画するコンポーネント。
 * 現在はプレースホルダ実装。将来的にCanvas描画に置き換え予定。
 *
 * @param props - {@link PdfPageProps}
 * @returns ページプレースホルダのReact要素
 *
 * @example
 * ```tsx
 * <PdfPage pageNumber={1} />
 * ```
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
