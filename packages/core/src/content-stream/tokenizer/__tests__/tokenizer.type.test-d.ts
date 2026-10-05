import { expectTypeOf, test } from "vitest";
import type { ContentStreamToken, PdfError } from "../../../pdf/index";
import type { Result } from "../../../utils/result/index";
import type { ContentStreamTokenizer } from "../index";

test("コンテンツストリーム解析は拡張トークンを1つ返す", () => {
  expectTypeOf<ContentStreamTokenizer["nextToken"]>().returns.toEqualTypeOf<
    Result<ContentStreamToken, PdfError>
  >();
});

test("コンテンツストリームの一括読み取りは拡張トークンの配列を返す", () => {
  expectTypeOf<ContentStreamTokenizer["tokenize"]>().returns.toEqualTypeOf<
    Result<ContentStreamToken[], PdfError>
  >();
});
