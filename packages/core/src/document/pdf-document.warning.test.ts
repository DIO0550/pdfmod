import { assert, expect, test } from "vitest";
import { PdfDocument } from "./pdf-document";
import { buildMinimalSinglePagePdf } from "./pdf-document.test.helpers";

test("/Info を持たない PDF を load すると metadata はキー数 0 の空オブジェクト (L-005)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
  expect(Object.keys(result.value.metadata)).toHaveLength(0);
});

test("/Info を持たない PDF を onWarning 未指定で load すると Ok を返す (L-005)", async () => {
  const result = await PdfDocument.load(buildMinimalSinglePagePdf());

  assert(result.ok);
});
