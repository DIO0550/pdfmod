import { afterEach, assert, expect, test, vi } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  btHandler,
  etHandler,
  registerTextStateOperators,
  tcHandler,
  tfHandler,
  tlHandler,
  trHandler,
  tsHandler,
  twHandler,
  tzHandler,
} from "../index";

afterEach(() => {
  vi.restoreAllMocks();
});

// [重複させる operator 名, その handler, 短絡までに register が呼ばれる名列（登録順の prefix）]
test.each<readonly [string, OperatorHandler, readonly string[]]>([
  ["BT", btHandler, ["BT"]],
  ["ET", etHandler, ["BT", "ET"]],
  ["Tf", tfHandler, ["BT", "ET", "Tf"]],
  ["Tc", tcHandler, ["BT", "ET", "Tf", "Tc"]],
  ["Tw", twHandler, ["BT", "ET", "Tf", "Tc", "Tw"]],
  ["Tz", tzHandler, ["BT", "ET", "Tf", "Tc", "Tw", "Tz"]],
  ["TL", tlHandler, ["BT", "ET", "Tf", "Tc", "Tw", "Tz", "TL"]],
  ["Tr", trHandler, ["BT", "ET", "Tf", "Tc", "Tw", "Tz", "TL", "Tr"]],
  ["Ts", tsHandler, ["BT", "ET", "Tf", "Tc", "Tw", "Tz", "TL", "Tr", "Ts"]],
])("%s が登録済みのとき registerTextStateOperators は Err を返し reduce が登録順 prefix で短絡する", (name, handler, expectedCalledNames) => {
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    name,
    handler,
  );
  assert(seed.ok);

  const registerSpy = vi.spyOn(OperatorRegistry, "register");
  const result = registerTextStateOperators(seed.value);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe(name);
  expect(registerSpy.mock.calls.map((call) => call[1])).toEqual(
    expectedCalledNames,
  );
});
