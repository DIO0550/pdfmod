import { assert, expect, test } from "vitest";
import { ObjectNumber } from "../../../../pdf/types/object-number/index";
import { ObjectStreamBody } from "../../index";
import { makeRawObjStm } from "./object-stream-body.test.helpers";

test.each([
  {
    header: "x 0 ",
    body: "true",
    n: 1,
    code: "OBJECT_STREAM_HEADER_INVALID",
    message: "integer objNum",
  },
  {
    header: "10 0 11 x ",
    body: "true false",
    n: 2,
    code: "OBJECT_STREAM_HEADER_INVALID",
    message: "integer offset",
  },
  {
    header: "10 -1 ",
    body: "true",
    n: 1,
    code: "OBJECT_STREAM_HEADER_INVALID",
    message: "Invalid offset",
  },
  {
    header: "10 99 ",
    body: "true",
    n: 1,
    code: "OBJECT_STREAM_INVALID",
    message: "Object offset",
  },
  {
    header: "10 4 11 0 ",
    body: "true false",
    n: 2,
    code: "OBJECT_STREAM_INVALID",
    message: "not monotonic",
  },
  {
    header: "10 0 11 100 ",
    body: "true false",
    n: 2,
    code: "OBJECT_STREAM_INVALID",
    message: "Next object offset",
  },
  {
    header: "10 0 11 0 ",
    body: "true false",
    n: 2,
    code: "OBJECT_STREAM_INVALID",
    message: "range is empty",
  },
])("ObjStmの破損したヘッダ '$header' はエラーになる", async ({
  header,
  body,
  n,
  code,
  message,
}) => {
  const stream = makeRawObjStm({ header, body, n });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(10),
  });
  assert(!result.ok);
  expect(result.error.code).toBe(code);
  expect(result.error.message).toContain(message);
});

test("対象が不在でも全Nペアのヘッダが壊れていればエラーになる", async () => {
  const stream = makeRawObjStm({
    header: "10 0 11 x ",
    body: "true false",
    n: 2,
  });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(12),
  });
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_HEADER_INVALID");
  expect(result.error.message).toContain("integer offset");
});

test.each([
  {
    body: "+",
    code: "OBJECT_PARSE_UNEXPECTED_TOKEN",
    message: "NaN integer token",
  },
  {
    body: "<< /Length 5 >>\nstream\nhello\nendstream",
    code: "OBJECT_STREAM_INVALID",
    message: "must not contain stream objects",
  },
])("ObjStm内の不正なPDF値 '$body' を拒否する", async ({
  body,
  code,
  message,
}) => {
  const stream = makeRawObjStm({ header: "10 0 ", body, n: 1 });
  const result = await ObjectStreamBody.find({
    stream,
    streamObjNum: ObjectNumber.of(15),
    targetObjNum: ObjectNumber.of(10),
  });
  assert(!result.ok);
  expect(result.error.code).toBe(code);
  expect(result.error.message).toContain(message);
});
