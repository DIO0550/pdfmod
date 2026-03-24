import { expect, test } from "vitest";
import { PdfPage, PdfViewer, usePdfDocument } from "./index.js";

test("PdfViewerがルートからexportされている", () => {
  expect(typeof PdfViewer).toBe("function");
});

test("PdfPageがルートからexportされている", () => {
  expect(typeof PdfPage).toBe("function");
});

test("usePdfDocumentがルートからexportされている", () => {
  expect(typeof usePdfDocument).toBe("function");
});
