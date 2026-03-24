import { expect, test } from "vitest";
import { PdfPage, PdfViewer, usePdfDocument } from "./index.js";

test.each([
  { name: "PdfViewer", value: PdfViewer },
  { name: "PdfPage", value: PdfPage },
  { name: "usePdfDocument", value: usePdfDocument },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});
