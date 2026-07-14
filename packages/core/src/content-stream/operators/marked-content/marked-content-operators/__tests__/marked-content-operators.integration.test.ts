import { assert, expect, test } from "vitest";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerMarkedContentOperators } from "../index";

test("registerMarkedContentOperators は ok を返す", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
});

test("BMC が登録される", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
  expect(OperatorRegistry.has(registered.value, "BMC")).toBe(true);
});

test("EMC が登録される", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
  expect(OperatorRegistry.has(registered.value, "EMC")).toBe(true);
});

test("BDC が登録される", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
  expect(OperatorRegistry.has(registered.value, "BDC")).toBe(true);
});

test("MP が登録される", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
  expect(OperatorRegistry.has(registered.value, "MP")).toBe(true);
});

test("DP が登録される", () => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());

  assert(registered.ok);
  expect(OperatorRegistry.has(registered.value, "DP")).toBe(true);
});
