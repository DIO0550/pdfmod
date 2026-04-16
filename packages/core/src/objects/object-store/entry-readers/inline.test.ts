import { assert, expect, test, vi } from "vitest";
import { err, ok } from "../../../result/index";
import { ByteOffset } from "../../../types/byte-offset/index";
import { GenerationNumber } from "../../../types/generation-number/index";
import type { XRefUsedEntry } from "../../../types/pdf-types/index";
import type { ObjectResolver } from "../../object-parser/index";
import { ObjectParser } from "../../object-parser/index";
import { makeRef } from "../object-store.test.helpers";
import { readInlineEntry } from "./inline";

const dummyResolver: ObjectResolver = () =>
  Promise.resolve(ok({ type: "integer", value: 0 }));

test("readInlineEntry は offset から indirect object をパースし body を返す", async () => {
  const data = new TextEncoder().encode("7 0 obj\n42\nendobj");
  const entry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };

  const result = await readInlineEntry(data, entry, makeRef(7), dummyResolver);
  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("readInlineEntry は obj header の objectNumber 不一致で OBJECT_PARSE_UNEXPECTED_TOKEN を返す", async () => {
  const data = new TextEncoder().encode("99 0 obj\n42\nendobj");
  const entry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };

  const result = await readInlineEntry(data, entry, makeRef(7), dummyResolver);
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  expect(result.error.message).toContain("mismatch");
});

test("readInlineEntry は parseIndirectObject のエラーをそのまま返す", async () => {
  const spy = vi.spyOn(ObjectParser, "parseIndirectObject").mockResolvedValue(
    err({
      code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
      message: "bad token",
      offset: ByteOffset.of(0),
    }),
  );

  try {
    const entry: XRefUsedEntry = {
      type: 1,
      offset: ByteOffset.of(0),
      generationNumber: GenerationNumber.of(0),
    };
    const result = await readInlineEntry(
      new Uint8Array(0),
      entry,
      makeRef(1),
      dummyResolver,
    );
    assert(!result.ok);
    expect(result.error.code).toBe("OBJECT_PARSE_UNEXPECTED_TOKEN");
  } finally {
    spy.mockRestore();
  }
});

test("readInlineEntry は resolver を parseIndirectObject に渡す", async () => {
  const data = new TextEncoder().encode("7 0 obj\n42\nendobj");
  const entry: XRefUsedEntry = {
    type: 1,
    offset: ByteOffset.of(0),
    generationNumber: GenerationNumber.of(0),
  };
  const customResolver: ObjectResolver = () =>
    Promise.resolve(ok({ type: "integer", value: 100 }));

  const spy = vi.spyOn(ObjectParser, "parseIndirectObject");

  try {
    await readInlineEntry(data, entry, makeRef(7), customResolver);
    expect(spy).toHaveBeenCalledWith(data, ByteOffset.of(0), customResolver);
  } finally {
    spy.mockRestore();
  }
});
