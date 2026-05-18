import { assert, expect, test } from "vitest";
import { CurrentPath } from "../../../../graphics-state/current-path/index";
import { GraphicsStateStack } from "../../../../graphics-state/stack/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerPathOperators } from "../../path-operators";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("100 100 200 150 re B を実行すると path 構築 → reset で currentPath が空になる", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 200 150 re B"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("100 100 m 200 200 l S を実行すると path 構築 → stroke reset で currentPath が空になる", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l S"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("100 100 m を実行すると currentPath に moveTo segment が積まれる (handler が dispatch された positive 観測)", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(false);
});
