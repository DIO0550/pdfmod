import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import { doHandler, registerXObjectOperators } from "../index";

// 空 registry に一括登録すると各 operator 名で同一参照の handler が lookup できる
test.each<readonly [string, OperatorHandler]>([
  ["Do", doHandler],
])("registerXObjectOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerXObjectOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});

// 一括登録後の registry を OperatorRegistry.has で全件確認する
test("registerXObjectOperators の戻り値は ok で XObject 系 operator すべてを保持する registry を返す", () => {
  const result = registerXObjectOperators(OperatorRegistry.create());
  assert(result.ok);

  expect(OperatorRegistry.has(result.value, "Do")).toBe(true);
});

// 既存 operator を持つ registry に対しても非破壊で Do を追加できる（State Management 非破壊更新）
test("registerXObjectOperators は既存 operator を持つ registry に対しても非破壊で Do を追加する", () => {
  // テスト用ダミー operator を 1 件登録した seed registry を用意
  const dummyHandler: OperatorHandler = (context) => ({
    ok: true,
    value: context,
  });
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "__dummy__",
    dummyHandler,
  );
  assert(seed.ok);

  const result = registerXObjectOperators(seed.value);
  assert(result.ok);

  // 既存 operator と Do の両方が has で true
  expect(OperatorRegistry.has(result.value, "__dummy__")).toBe(true);
  expect(OperatorRegistry.has(result.value, "Do")).toBe(true);

  // 既存 operator の handler 参照が変化していない
  const lookedDummy = OperatorRegistry.lookup(result.value, "__dummy__");
  assert(lookedDummy.some);
  expect(lookedDummy.value).toBe(dummyHandler);
});
