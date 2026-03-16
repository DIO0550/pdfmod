import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { PdfViewer } from "./PdfViewer.js";

afterEach(cleanup);

test("sourceがnullのとき空状態を表示する", () => {
  render(<PdfViewer source={null} />);
  expect(screen.getByTestId("pdf-viewer-empty")).toBeDefined();
  expect(screen.getByText("No document loaded")).toBeDefined();
});

test("ArrayBufferからドキュメントを表示する", async () => {
  const pdfContent = new TextEncoder().encode("%PDF-1.7 test");
  render(<PdfViewer source={pdfContent} />);

  await waitFor(() => {
    expect(screen.getByTestId("pdf-viewer")).toBeDefined();
  });
  expect(screen.getByTestId("pdf-page")).toBeDefined();
});

test("classNameプロパティを受け付ける", () => {
  render(<PdfViewer source={null} className="custom-class" />);
  const el = screen.getByTestId("pdf-viewer-empty");
  expect(el.className).toBe("custom-class");
});
