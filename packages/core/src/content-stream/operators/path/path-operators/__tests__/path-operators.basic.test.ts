import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import {
  cHandler,
  closeFillStrokeEvenOddHandler,
  closeFillStrokeHandler,
  closeStrokeHandler,
  endPathHandler,
  fillEvenOddHandler,
  fillHandler,
  fillStrokeEvenOddHandler,
  fillStrokeHandler,
  hHandler,
  lHandler,
  mHandler,
  registerPathOperators,
  reHandler,
  strokeHandler,
  vHandler,
  yHandler,
} from "../../path-operators";

test.each<readonly [string, OperatorHandler]>([
  ["m", mHandler],
  ["l", lHandler],
  ["c", cHandler],
  ["v", vHandler],
  ["y", yHandler],
  ["h", hHandler],
  ["re", reHandler],
  ["S", strokeHandler],
  ["s", closeStrokeHandler],
  ["f", fillHandler],
  ["F", fillHandler],
  ["f*", fillEvenOddHandler],
  ["B", fillStrokeHandler],
  ["B*", fillStrokeEvenOddHandler],
  ["b", closeFillStrokeHandler],
  ["b*", closeFillStrokeEvenOddHandler],
  ["n", endPathHandler],
])("registerPathOperators は %s に対応する handler を登録する", (name, expectedHandler) => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const looked = OperatorRegistry.lookup(result.value, name);
  assert(looked.some);
  expect(looked.value).toBe(expectedHandler);
});

test("F は f と同じ fillHandler 実体で引ける", () => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const fill = OperatorRegistry.lookup(result.value, "f");
  const alias = OperatorRegistry.lookup(result.value, "F");
  assert(fill.some);
  assert(alias.some);
  expect(alias.value).toBe(fill.value);
  expect(alias.value).toBe(fillHandler);
});

test("f と f* は lookup の value が別 handler 実体である", () => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const nonzero = OperatorRegistry.lookup(result.value, "f");
  const evenOdd = OperatorRegistry.lookup(result.value, "f*");
  assert(nonzero.some);
  assert(evenOdd.some);
  expect(nonzero.value).not.toBe(evenOdd.value);
});

test("B と B* は lookup の value が別 handler 実体である", () => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const nonzero = OperatorRegistry.lookup(result.value, "B");
  const evenOdd = OperatorRegistry.lookup(result.value, "B*");
  assert(nonzero.some);
  assert(evenOdd.some);
  expect(nonzero.value).not.toBe(evenOdd.value);
});

test("closeSubpathContext は operator 名として登録されない", () => {
  const result = registerPathOperators(OperatorRegistry.create());
  assert(result.ok);

  const kebab = OperatorRegistry.lookup(result.value, "close-subpath");
  const camel = OperatorRegistry.lookup(result.value, "closeSubpath");
  expect(kebab.some).toBe(false);
  expect(camel.some).toBe(false);
});
