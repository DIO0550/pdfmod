import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { PdfViewer } from "../src/index.js";

afterEach(cleanup);

describe("PdfViewer", () => {
  it("should render empty state when source is null", () => {
    render(<PdfViewer source={null} />);
    expect(screen.getByTestId("pdf-viewer-empty")).toBeDefined();
    expect(screen.getByText("No document loaded")).toBeDefined();
  });

  it("should render with a document from ArrayBuffer", async () => {
    const pdfContent = new TextEncoder().encode("%PDF-1.7 test");
    render(<PdfViewer source={pdfContent} />);

    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeDefined();
    });
    expect(screen.getByTestId("pdf-page")).toBeDefined();
  });

  it("should accept className prop", () => {
    render(<PdfViewer source={null} className="custom-class" />);
    const el = screen.getByTestId("pdf-viewer-empty");
    expect(el.className).toBe("custom-class");
  });
});
