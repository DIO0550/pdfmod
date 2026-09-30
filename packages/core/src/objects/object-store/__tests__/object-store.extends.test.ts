import { assert, expect, test } from "vitest";
import { ObjectStore } from "../index";
import { makeCollectionSource } from "./object-store.extends.test.helpers";
import { makeRef } from "./object-store.test.helpers";

test.each([
  {
    label: "子",
    child: [{ objectNumber: 5, body: "true" }],
    parent: [{ objectNumber: 7, body: "false" }],
    expected: true,
  },
  {
    label: "親",
    child: [{ objectNumber: 7, body: "true" }],
    parent: [{ objectNumber: 5, body: "false" }],
    expected: false,
  },
  {
    label: "重複時の子",
    child: [{ objectNumber: 5, body: "true" }],
    parent: [{ objectNumber: 5, body: "false" }],
    expected: true,
  },
])("Extendsチェーンでは$labelの対象番号を解決する", async ({
  child,
  parent,
  expected,
}) => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 }, objects: child },
    { objectNumber: 20, objects: parent },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: expected });
});

test("複数の親を辿って祖父ObjStmの対象番号を解決する", async () => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 } },
    { objectNumber: 20, extendsRef: { objectNumber: 30 } },
    { objectNumber: 30, objects: [{ objectNumber: 5, body: "42" }] },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(result.ok);
  expect(result.value).toEqual({ type: "integer", value: 42 });
});

test("親同士で対象番号が重複すれば子に近い親の値を解決する", async () => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 } },
    {
      objectNumber: 20,
      extendsRef: { objectNumber: 30 },
      objects: [{ objectNumber: 5, body: "true" }],
    },
    { objectNumber: 30, objects: [{ objectNumber: 5, body: "false" }] },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: true });
});

test("Extendsの親参照はxrefと一致する非ゼロ世代も解決する", async () => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20, generationNumber: 7 } },
    {
      objectNumber: 20,
      generationNumber: 7,
      objects: [{ objectNumber: 5, body: "false" }],
    },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(result.ok);
  expect(result.value).toEqual({ type: "boolean", value: false });
});

test("全チェーンに対象番号がなければオブジェクト解決はエラーになる", async () => {
  const source = makeCollectionSource([
    { objectNumber: 10, extendsRef: { objectNumber: 20 } },
    { objectNumber: 20, objects: [{ objectNumber: 7, body: "true" }] },
  ]);
  const storeResult = ObjectStore.create(source);
  assert(storeResult.ok);
  const result = await storeResult.value.get(makeRef(5));
  assert(!result.ok);
  expect(result.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(result.error.message).toContain("does not contain object 5");
});
