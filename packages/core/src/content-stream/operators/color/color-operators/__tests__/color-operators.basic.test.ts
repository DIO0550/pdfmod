import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  GHandler,
  gHandler,
  KHandler,
  kHandler,
  registerColorOperators,
} from "../index";

test.each<readonly [string, OperatorHandler]>([
  ["G", GHandler],
  ["g", gHandler],
  ["K", KHandler],
  ["k", kHandler],
])("registerColorOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerColorOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});

test("registerColorOperators の戻り値は ok で OperatorRegistry を保持する", () => {
  const result = registerColorOperators(OperatorRegistry.create());
  assert(result.ok);
  expect(OperatorRegistry.has(result.value, "G")).toBe(true);
  expect(OperatorRegistry.has(result.value, "g")).toBe(true);
  expect(OperatorRegistry.has(result.value, "K")).toBe(true);
  expect(OperatorRegistry.has(result.value, "k")).toBe(true);
});
