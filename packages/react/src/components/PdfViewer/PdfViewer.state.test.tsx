import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PdfViewer } from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("URL fetch成功時にpdf-viewerが表示される", async () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(pdfBytes.buffer),
      }),
    ),
  );

  render(<PdfViewer source="https://example.com/doc.pdf" />);

  await waitFor(() => {
    expect(screen.getByTestId("pdf-viewer")).toBeDefined();
  });
});

test("URL fetch失敗時にエラーメッセージが表示される", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
  );

  render(<PdfViewer source="https://example.com/doc.pdf" />);

  await waitFor(() => {
    expect(screen.getByTestId("pdf-viewer-error")).toBeDefined();
  });
  expect(screen.getByText("Error: Failed to fetch PDF: 500")).toBeDefined();
});

test("fetch中はloading状態が表示される", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );

  render(<PdfViewer source="https://example.com/doc.pdf" />);

  expect(screen.getByTestId("pdf-viewer-loading")).toBeDefined();
  expect(screen.getByText("Loading...")).toBeDefined();
});

test("classNameはloading状態でも伝播される", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );

  render(
    <PdfViewer source="https://example.com/doc.pdf" className="my-viewer" />,
  );

  expect(screen.getByTestId("pdf-viewer-loading").className).toBe("my-viewer");
});
