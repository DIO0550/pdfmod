import { afterEach, assert, expect, test, vi } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  registerTextPositioningOperators,
  tdHandler,
  tdLeadingHandler,
  tmHandler,
  tStarHandler,
} from "../index";

afterEach(() => {
  vi.restoreAllMocks();
});

// [重複させる operator 名, その handler, 短絡までに register が呼ばれる名列（登録順の prefix）]
test.each<readonly [string, OperatorHandler, readonly string[]]>([
  ["Td", tdHandler, ["Td"]],
  ["TD", tdLeadingHandler, ["Td", "TD"]],
  ["Tm", tmHandler, ["Td", "TD", "Tm"]],
  ["T*", tStarHandler, ["Td", "TD", "Tm", "T*"]],
])("%s が登録済みのとき registerTextPositioningOperators は Err を返し reduce が登録順 prefix で短絡する", (name, handler, expectedCalledNames) => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    name,
    handler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerTextPositioningOperators(seed.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe(name);
  expect(registerSpy.mock.calls.map((call) => call[1])).toEqual(
    expectedCalledNames,
  );
});
