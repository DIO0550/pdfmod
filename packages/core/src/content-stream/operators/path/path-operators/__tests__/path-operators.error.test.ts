import { afterEach, assert, expect, test, vi } from "vitest";
import { OperatorRegistry } from "../../../../operator-registry/index";
import {
  endPathHandler,
  lHandler,
  mHandler,
  registerPathOperators,
} from "../../path-operators";

afterEach(() => {
  vi.restoreAllMocks();
});

test("m が登録済みなら OPERATOR_ALREADY_REGISTERED の Err を返し operatorName が m", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "m",
    mHandler,
  );
  assert(seed.ok);

  const result = registerPathOperators(seed.value);

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ALREADY_REGISTERED");
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("m");
});

test("m と l が事前登録済みでも最初の重複 m の Err が返る (fail-fast)", () => {
  const seedM = OperatorRegistry.register(
    OperatorRegistry.create(),
    "m",
    mHandler,
  );
  assert(seedM.ok);
  const seedL = OperatorRegistry.register(seedM.value, "l", lHandler);
  assert(seedL.ok);

  const result = registerPathOperators(seedL.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("m");
});

test("l のみ事前登録済みなら配列順序で l に到達した時点で短絡する", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "l",
    lHandler,
  );
  assert(seed.ok);

  const result = registerPathOperators(seed.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("l");
});

test("m 重複時、後続 operator (l/c/v/y/h/re/S/s/f/F/f*/B/B*/b/b*/n) への register は呼ばれない", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "m",
    mHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");

  const result = registerPathOperators(seed.value);
  assert(!result.ok);

  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["m"]);
});

test("l 重複時、配列順で m は成功 → l で短絡し c/v/y/h/re/S/s/f/F/f*/B/B*/b/b*/n は呼ばれない", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "l",
    lHandler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");

  const result = registerPathOperators(seed.value);
  assert(!result.ok);

  const calledNames = registerSpy.mock.calls.map((call) => call[1]);
  expect(calledNames).toEqual(["m", "l"]);
});

test("n が登録済みなら OPERATOR_ALREADY_REGISTERED の Err を返す", () => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    "n",
    endPathHandler,
  );
  assert(seed.ok);

  const result = registerPathOperators(seed.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe("n");
});
