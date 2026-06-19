import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  apostropheHandler,
  quoteHandler,
  registerTextShowingOperators,
  tjArrayHandler,
  tjHandler,
} from "../index";

// 空 registry に一括登録すると各 operator 名で同一参照の handler が lookup できる
test.each<readonly [string, OperatorHandler]>([
  ["Tj", tjHandler],
  ["TJ", tjArrayHandler],
  ["'", apostropheHandler],
  ['"', quoteHandler],
])("registerTextShowingOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerTextShowingOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});

// 一括登録後の registry を OperatorRegistry.has で全件確認する
test("registerTextShowingOperators の戻り値は ok で 4 operator すべてを保持する registry を返す", () => {
  const result = registerTextShowingOperators(OperatorRegistry.create());
  assert(result.ok);

  expect(OperatorRegistry.has(result.value, "Tj")).toBe(true);
  expect(OperatorRegistry.has(result.value, "TJ")).toBe(true);
  expect(OperatorRegistry.has(result.value, "'")).toBe(true);
  expect(OperatorRegistry.has(result.value, '"')).toBe(true);
});
