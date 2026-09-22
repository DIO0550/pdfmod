import { assert, expect, test, vi } from "vitest";
import { ObjectNumber } from "../../../../../pdf/types/object-number/index";
import type {
  PdfStream,
  XRefCompressedEntry,
} from "../../../../../pdf/types/pdf-types/index";
import { err, ok } from "../../../../../utils/result/index";
import { ObjectStreamBody } from "../../../../object-stream-extractor/index";
import { makeRef } from "../../../__tests__/object-store.test.helpers";
import { readObjectStreamEntry } from "../../object-stream";

const dummyStream: PdfStream = {
  type: "stream",
  dictionary: { type: "dictionary", entries: new Map() },
  data: new Uint8Array(),
};

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

    const result = await readObjectStreamEntry({
      stream: dummyStream,
      ref: makeRef(5),
      entry,
    });
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

    await readObjectStreamEntry({
      stream: dummyStream,
      ref: makeRef(7),
      entry,
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith({
      stream: dummyStream,
      targetObjNum: ObjectNumber.of(7),
      streamObjNum: ObjectNumber.of(20),
      indexInStream: 3,
      cache: undefined,
    });
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

    const result = await readObjectStreamEntry({
      stream: dummyStream,
      ref: makeRef(5),
      entry,
    });
    assert(!result.ok);
    expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  } finally {
    spy.mockRestore();
  }
});
