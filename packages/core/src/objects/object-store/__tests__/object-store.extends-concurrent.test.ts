import { assert, expect, test } from "vitest";
import { ObjectStore } from "../index";
import { makeSharedParentSource } from "./object-store.extends.test.helpers";
import { makeRef } from "./object-store.test.helpers";

test("並行取得する子が共有する親からそれぞれの番号を解決する", async () => {
  const storeResult = ObjectStore.create(makeSharedParentSource());
  assert(storeResult.ok);
  const [first, second, repeated] = await Promise.all([
    storeResult.value.get(makeRef(5)),
    storeResult.value.get(makeRef(6)),
    storeResult.value.get(makeRef(5)),
  ]);
  assert(first.ok);
  assert(second.ok);
  assert(repeated.ok);
  expect(first.value).toEqual({ type: "boolean", value: true });
  expect(second.value).toEqual({ type: "boolean", value: false });
  expect(repeated.value).toEqual(first.value);
});

test.each([
  { firstNumber: 5, secondNumber: 6, firstValue: true, secondValue: false },
  { firstNumber: 6, secondNumber: 5, firstValue: false, secondValue: true },
])("共有する親の取得開始を $firstNumber → $secondNumber とずらしても解決する", async ({
  firstNumber,
  secondNumber,
  firstValue,
  secondValue,
}) => {
  const storeResult = ObjectStore.create(makeSharedParentSource());
  assert(storeResult.ok);
  const firstPromise = storeResult.value.get(makeRef(firstNumber));
  await Promise.resolve();
  const secondPromise = storeResult.value.get(makeRef(secondNumber));
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert(first.ok);
  assert(second.ok);
  expect(first.value).toEqual({ type: "boolean", value: firstValue });
  expect(second.value).toEqual({ type: "boolean", value: secondValue });
});

test("同時取得で共有する親の先が欠損していれば全取得がエラーになる", async () => {
  const storeResult = ObjectStore.create(
    makeSharedParentSource({ parentExtends: 99 }),
  );
  assert(storeResult.ok);
  const [first, second] = await Promise.all([
    storeResult.value.get(makeRef(5)),
    storeResult.value.get(makeRef(6)),
  ]);
  assert(!first.ok);
  assert(!second.ok);
  expect(first.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(first.error.message).toContain("target 99");
  expect(second.error).toEqual(first.error);
});

test.each([
  { firstNumber: 5, secondNumber: 6 },
  { firstNumber: 6, secondNumber: 5 },
])("開始を $firstNumber → $secondNumber とずらしても共有親の先の欠損はエラーになる", async ({
  firstNumber,
  secondNumber,
}) => {
  const storeResult = ObjectStore.create(
    makeSharedParentSource({ parentExtends: 99 }),
  );
  assert(storeResult.ok);
  const firstPromise = storeResult.value.get(makeRef(firstNumber));
  await Promise.resolve();
  const secondPromise = storeResult.value.get(makeRef(secondNumber));
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert(!first.ok);
  assert(!second.ok);
  expect(first.error.code).toBe("OBJECT_STREAM_INVALID");
  expect(first.error.message).toContain("target 99");
  expect(second.error).toEqual(first.error);
});
