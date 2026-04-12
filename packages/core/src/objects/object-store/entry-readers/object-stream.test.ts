import { assert, expect, test, vi } from "vitest";
import { err, ok } from "../../../result/index";
import { ObjectNumber } from "../../../types/object-number/index";
import type { XRefCompressedEntry } from "../../../types/pdf-types/index";
import { ObjectStreamBody } from "../../object-stream-extractor/index";
import { makeRef } from "../object-store.test.helpers";
import { readObjectStreamEntry } from "./object-stream";

test("readObjectStreamEntry は ObjectStreamBody.extract を呼び result を返す", async () => {
  const spy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue(ok({ type: "boolean", value: true }));

  try {
    const entry: XRefCompressedEntry = {
      type: 2,
      streamObject: ObjectNumber.of(10),
      indexInStream: 0,
    };
    const resolver = {
      resolve: () => Promise.resolve(ok({ type: "null" as const })),
    };

    const result = await readObjectStreamEntry(
      resolver,
      undefined,
      makeRef(5),
      entry,
    );
    assert(result.ok);
    expect(result.value).toEqual({ type: "boolean", value: true });
  } finally {
    spy.mockRestore();
  }
});

test("readObjectStreamEntry は extract に正しい引数を渡す", async () => {
  const spy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue(ok({ type: "null" }));

  try {
    const entry: XRefCompressedEntry = {
      type: 2,
      streamObject: ObjectNumber.of(20),
      indexInStream: 3,
    };
    const resolver = {
      resolve: () => Promise.resolve(ok({ type: "null" as const })),
    };

    await readObjectStreamEntry(resolver, undefined, makeRef(7), entry);

    expect(spy).toHaveBeenCalledOnce();
    const args = spy.mock.calls[0];
    expect(args[0]).toBe(resolver);
    expect(args[1]).toBeUndefined();
    expect(args[2]).toBe(ObjectNumber.of(7));
    expect(args[3]).toBe(ObjectNumber.of(20));
    expect(args[4]).toBe(3);
  } finally {
    spy.mockRestore();
  }
});

test("readObjectStreamEntry は extract のエラーをそのまま返す", async () => {
  const spy = vi
    .spyOn(ObjectStreamBody, "extract")
    .mockResolvedValue(
      err({ code: "OBJECT_STREAM_INVALID", message: "bad stream" }),
    );

  try {
    const entry: XRefCompressedEntry = {
      type: 2,
      streamObject: ObjectNumber.of(10),
      indexInStream: 0,
    };
    const resolver = {
      resolve: () => Promise.resolve(ok({ type: "null" as const })),
    };

    const result = await readObjectStreamEntry(
      resolver,
      undefined,
      makeRef(5),
      entry,
    );
    assert(!result.ok);
    expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  } finally {
    spy.mockRestore();
  }
});
