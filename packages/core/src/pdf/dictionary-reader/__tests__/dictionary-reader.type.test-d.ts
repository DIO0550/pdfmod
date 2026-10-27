import { expectTypeOf, test } from "vitest";
import type { Option } from "../../../utils/option/index";
import type { Result } from "../../../utils/result/index";
import { ByteOffset } from "../../types/byte-offset/index";
import type { PdfInteger, PdfName } from "../../types/pdf-types/index";
import { type PdfDictionaryReadError, PdfDictionaryReader } from "../index";

test("期待型に応じて戻り値が絞り込まれる", () => {
  const reader: PdfDictionaryReader = {
    dictionary: { type: "dictionary", entries: new Map() },
    offset: ByteOffset.of(0),
    path: "",
  };
  const count = PdfDictionaryReader.required(reader, {
    key: "Count",
    type: "integer",
  });
  const name = PdfDictionaryReader.optional(reader, {
    key: "Type",
    type: "name",
  });

  expectTypeOf(count).toEqualTypeOf<
    Result<PdfInteger, PdfDictionaryReadError>
  >();

  expectTypeOf(name).toEqualTypeOf<
    Result<Option<PdfName>, PdfDictionaryReadError>
  >();
});
