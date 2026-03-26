import { expect, test } from "vitest";
import { PdfPage, PdfViewer, usePdfDocument } from "./index";

test.each([
  { name: "PdfViewer", value: PdfViewer },
  { name: "PdfPage", value: PdfPage },
  { name: "usePdfDocument", value: usePdfDocument },
])("$nameがルートからexportされている", ({ value }) => {
  expect(typeof value).toBe("function");
});
