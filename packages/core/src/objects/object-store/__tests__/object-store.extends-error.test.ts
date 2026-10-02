import { assert, expect, test } from "vitest";
import { FreeObjectNumber } from "../../../pdf/types/free-object-number/index";
import { GenerationNumber } from "../../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../../pdf/types/object-number/index";
import type { XRefEntry } from "../../../pdf/types/pdf-types/index";
import { ObjectStore } from "../index";
import {
  makeCollectionSource,
  type ObjectStreamFixture,
} from "./object-store.extends.test.helpers";
import { makeRef } from "./object-store.test.helpers";

test.each([
  {
    label: "free",
    entry: {
      type: 0,
      nextFreeObject: FreeObjectNumber.of(0),
      generationNumber: GenerationNumber.of(0),
    },
  },
  {
    label: "type=2",
    entry: { type: 2, streamObject: ObjectNumber.of(10), indexInStream: 0 },
  },
] satisfies readonly {
  readonly label: string;
  readonly entry: XRefEntry;
}[])("Extendsは$labelの親xrefを拒否する", async ({ entry }) => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 } },
  ]);
  source.xref.entries.set(ObjectNumber.of(20), entry);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("target 20");
  expect(result.error.message).toContain("uncompressed stream reference");
});

test.each([
  {
    label: "世代不一致",
    parent: { objectNumber: 20, generationNumber: 1 },
    message: "generation mismatch",
  },
  {
    label: "非ストリーム",
    parent: { objectNumber: 20, inlineBody: "<< /Type /ObjStm >>" },
    message: "not a stream",
  },
  {
    label: "非ObjStm",
    parent: { objectNumber: 20, type: "XRef" },
    message: "/Type must be /ObjStm",
  },
] satisfies readonly {
  readonly label: string;
  readonly parent: ObjectStreamFixture;
  readonly message: string;
}[])("Extendsの$labelの親はエラーになる", async ({ parent, message }) => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 } },
    parent,
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain(message);
});

test.each([
  { label: "不在", objects: [] },
  { label: "存在", objects: [{ objectNumber: 5, body: "true" }] },
])("子の対象が$labelでも欠損する親はエラーになる", async ({ objects }) => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 }, objects },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const first = await storeResult.value.get(makeRef(5));
  const second = await storeResult.value.get(makeRef(5));
  assert(!first.ok);
  assert(!second.ok);
  expect(first.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(first.error.message).toContain("target 20");
  expect(second.error).toEqual(first.error);
});

test("親ストリームのLengthが対象参照へ戻ると循環エラーの詳細を保持する", async () => {
  const source = makeCollectionSource([
    {
      objectNumber: 10,
      extendsRef: { objectNumber: 20 },
      objects: [{ objectNumber: 5, body: "true" }],
    },
    { objectNumber: 20, lengthRef: 5 },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("target 20 could not be resolved");
  expect(result.error.message).toContain("OBJECT_PARSE_STREAM_LENGTH");
  expect(result.error.message).toContain(
    "Circular reference detected for object 5",
  );
});
