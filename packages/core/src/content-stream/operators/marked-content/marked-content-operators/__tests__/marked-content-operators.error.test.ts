import { afterEach, assert, expect, test, vi } from "vitest";
import { ok } from "../../../../../utils/result/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerMarkedContentOperators } from "../index";

afterEach(() => {
  vi.restoreAllMocks();
});

test("BMC の重複登録で fail-fast する（register 呼び出しは BMC で止まる）", () => {
  const base = OperatorRegistry.create();
  const seeded = OperatorRegistry.register(base, "BMC", (ctx) => ok(ctx));
  assert(seeded.ok);

  const spy = vi.spyOn(OperatorRegistry, "register");
  const result = registerMarkedContentOperators(seeded.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("BMC");
  const calledNames = spy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["BMC"]);
});

test("EMC の重複登録で fail-fast する（register 呼び出しは BMC 登録後に止まる）", () => {
  const base = OperatorRegistry.create();
  const seeded = OperatorRegistry.register(base, "EMC", (ctx) => ok(ctx));
  assert(seeded.ok);

  const spy = vi.spyOn(OperatorRegistry, "register");
  const result = registerMarkedContentOperators(seeded.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("EMC");
  const calledNames = spy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["BMC", "EMC"]);
});
