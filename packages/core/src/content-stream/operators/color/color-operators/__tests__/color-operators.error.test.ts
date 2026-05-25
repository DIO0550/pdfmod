import { afterEach, assert, expect, test, vi } from "vitest";
import { OperatorRegistry } from "../../../../operator-registry/index";
import {
  GHandler,
  gHandler,
  KHandler,
  kHandler,
  RGHandler,
  registerColorOperators,
  rgHandler,
} from "../index";

afterEach(() => {
  vi.restoreAllMocks();
});

test("G 重複時、reduce は先頭で短絡し register は ['G'] でのみ呼ばれる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "G",
    GHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("G");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G"]);
});

test("g 重複時、reduce は途中で短絡し register は ['G', 'g'] で止まる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "g",
    gHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("g");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G", "g"]);
});

test("RG 重複時、reduce は RG で短絡し register は ['G', 'g', 'RG'] で止まる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "RG",
    RGHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("RG");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G", "g", "RG"]);
});

test("rg 重複時、reduce は rg で短絡し register は ['G', 'g', 'RG', 'rg'] で止まる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "rg",
    rgHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("rg");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G", "g", "RG", "rg"]);
});

test("K 重複時、reduce は K で短絡し register は ['G', 'g', 'RG', 'rg', 'K'] で止まる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "K",
    KHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("K");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G", "g", "RG", "rg", "K"]);
});

test("k 重複時、reduce は k で短絡し register は ['G', 'g', 'RG', 'rg', 'K', 'k'] で止まる", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "k",
    kHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerColorOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("k");
  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["G", "g", "RG", "rg", "K", "k"]);
});
