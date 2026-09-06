// 担当範囲: オブジェクト番号 0 に由来する null の「パース時」と「解決時」の責務分界（#334 / D-5）。
// - パース時の null: `0 G R` は xref を一切見ずに direct-object が null に畳む
// - 解決時の null: `5 0 R` は参照のまま残り、xref の 5 番が free エントリのとき ObjectStore が null を返す

import { assert, expect, test } from "vitest";
import { Tokenizer } from "../../../lexer/tokenizer/index";
import { ByteOffset } from "../../../pdf/types/byte-offset/index";
import { FreeObjectNumber } from "../../../pdf/types/free-object-number/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import type { XRefFreeEntry } from "../../../pdf/types/pdf-types/index";
import { BufferedTokenizer } from "../../object-parser/buffered-tokenizer/index";
import { DirectObject } from "../../object-parser/direct-object/index";
import { ObjectStore } from "../index";
import {
  makeRef,
  makeStoreSource,
  makeXRefTable,
  unwrapOk,
} from "./object-store.test.helpers";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test("パース時の null: 0 G R は xref を参照せずその場で null になる", () => {
  const bt = new BufferedTokenizer(new Tokenizer(enc("0 0 R")));
  const result = DirectObject.parse(bt, ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({ type: "null" });
});

test("解決時の null: 5 0 R はパース時は参照のまま残る", () => {
  const bt = new BufferedTokenizer(new Tokenizer(enc("5 0 R")));
  const result = DirectObject.parse(bt, ByteOffset.of(0), 0);
  assert(result.ok);
  expect(result.value).toEqual({
    type: "indirect-ref",
    objectNumber: 5,
    generationNumber: 0,
  });
});

test("解決時の null: xref の 5 番が free エントリなら get が null を返す", async () => {
  const freeEntry: XRefFreeEntry = {
    type: 0,
    nextFreeObject: FreeObjectNumber.of(0),
    generationNumber: GenerationNumber.of(1),
  };
  const store = unwrapOk(
    ObjectStore.create(
      makeStoreSource({ xref: makeXRefTable([[5, freeEntry]]) }),
    ),
  );
  const resolved = await store.get(makeRef(5));
  expect(resolved).toEqual({ ok: true, value: { type: "null" } });
});
