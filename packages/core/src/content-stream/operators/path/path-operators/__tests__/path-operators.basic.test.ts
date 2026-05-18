import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  cHandler,
  fillHandler,
  fillStrokeHandler,
  hHandler,
  lHandler,
  mHandler,
  registerPathOperators,
  reHandler,
  strokeHandler,
} from "../../path-operators";

test.each<readonly [string, OperatorHandler]>([
  ["m", mHandler],
  ["l", lHandler],
  ["c", cHandler],
  ["h", hHandler],
  ["re", reHandler],
  ["S", strokeHandler],
  ["f", fillHandler],
  ["B", fillStrokeHandler],
])("registerPathOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});
