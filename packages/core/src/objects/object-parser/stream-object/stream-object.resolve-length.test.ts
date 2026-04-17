import { assert, expect, test } from "vitest";
import { ByteOffset } from "../../../types/byte-offset/index";
import { err, ok } from "../../../utils/result/index";
import type { ObjectResolver, StreamLength } from "../types";
import { StreamObject } from "./index";

const indirectLen: StreamLength = {
  kind: "indirect",
  ref: { type: "indirect-ref", objectNumber: 5, generationNumber: 0 },
};

test("kind='direct' は resolver を呼ばず値を返す", async () => {
  let called = false;
  const resolver: ObjectResolver = () => {
    called = true;
    return Promise.resolve(ok({ type: "integer", value: 999 }));
  };
  const direct: StreamLength = { kind: "direct", value: 42 };
  const result = await StreamObject.resolveLength(
    direct,
    ByteOffset.of(0),
    0,
    resolver,
  );
  assert(result.ok);
  expect(result.value).toBe(42);
  expect(called).toBe(false);
});

test("kind='indirect' で resolver が integer を返すときその値を返す", async () => {
  const resolver: ObjectResolver = () =>
    Promise.resolve(ok({ type: "integer", value: 77 }));
  const result = await StreamObject.resolveLength(
    indirectLen,
    ByteOffset.of(0),
    0,
    resolver,
  );
  assert(result.ok);
  expect(result.value).toBe(77);
});

test("kind='indirect' で resolver 未提供のときエラー", async () => {
  const result = await StreamObject.resolveLength(
    indirectLen,
    ByteOffset.of(0),
    0,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
});

test("kind='indirect' で resolver がエラーを返したときエラーに包む", async () => {
  const resolver: ObjectResolver = () =>
    Promise.resolve(
      err({ code: "NOT_IMPLEMENTED" as const, message: "inner error" }),
    );
  const result = await StreamObject.resolveLength(
    indirectLen,
    ByteOffset.of(0),
    0,
    resolver,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain("inner error");
});

test("kind='indirect' で resolver が integer 以外を返したときエラー", async () => {
  const resolver: ObjectResolver = () =>
    Promise.resolve(ok({ type: "name", value: "not-integer" }));
  const result = await StreamObject.resolveLength(
    indirectLen,
    ByteOffset.of(0),
    0,
    resolver,
  );
  assert(!result.ok);
  expect(result.error.code).toBe("TYPE_MISMATCH");
});
