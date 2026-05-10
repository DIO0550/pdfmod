import { assert, expect, test } from "vitest";
import { ok } from "../../../utils/result/index";
import {
  GraphicsState,
  GraphicsStateStack,
  Matrix,
} from "../../graphics-state/index";
import { ContentStreamInterpreter } from "../../interpreter/index";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../operator-registry/index";
import { registerGraphicsStateOperators } from "./index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

const qHandler: OperatorHandler = (context) =>
  ok({
    ...context,
    graphicsStateStack: GraphicsStateStack.save(context.graphicsStateStack),
  });

const QHandler: OperatorHandler = (context) =>
  ok({
    ...context,
    graphicsStateStack: GraphicsStateStack.restore(context.graphicsStateStack),
  });

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
  const baseRegistered = registerGraphicsStateOperators(
    OperatorRegistry.create(),
  );
  assert(baseRegistered.ok);
  const withQ = OperatorRegistry.register(baseRegistered.value, "q", qHandler);
  assert(withQ.ok);
  const withQQ = OperatorRegistry.register(withQ.value, "Q", QHandler);
  assert(withQQ.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("q 1 0 0 1 100 200 cm 2 w Q"),
    registry: withQQ.value,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current).toEqual(GraphicsState.create());
});
