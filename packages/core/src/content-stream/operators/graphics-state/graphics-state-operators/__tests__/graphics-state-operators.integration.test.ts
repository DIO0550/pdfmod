import { assert, expect, test } from "vitest";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
} from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerGraphicsStateOperators } from "../../graphics-state-operators";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("barrel 経由で `1 0 0 1 100 200 cm 2 w` を実行すると CTM と lineWidth が更新される", () => {
  const registered = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("1 0 0 1 100 200 cm 2 w"),
    registry: registered.value,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.ctm).toEqual(Matrix.create(1, 0, 0, 1, 100, 200));
  expect(current.lineWidth).toBe(2);
});

test("`q 1 0 0 1 100 200 cm 2 w Q` を実行すると save/restore で初期 GraphicsState に戻る", () => {
  const registered = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("q 1 0 0 1 100 200 cm 2 w Q"),
    registry: registered.value,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current).toEqual(GraphicsState.create());
});

test("3 段ネスト `q 2 w q 3 w q 4 w Q Q Q` で初期状態に復帰する", () => {
  const registered = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("q 2 w q 3 w q 4 w Q Q Q"),
    registry: registered.value,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current).toEqual(GraphicsState.create());
});

test("unbalanced Q を interpreter 経由で実行しても ok で継続する", () => {
  const registered = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("Q"),
    registry: registered.value,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current).toEqual(GraphicsState.create());
});
