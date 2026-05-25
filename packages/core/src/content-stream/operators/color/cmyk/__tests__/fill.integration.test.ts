import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { kHandler } from "../fill";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("`0.5 0.5 0.5 0.5 k` を実行すると fillColor=Color.cmyk(0.5, 0.5, 0.5, 0.5) に更新される", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "k",
    kHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.5 0.5 0.5 0.5 k"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.cmyk(0.5, 0.5, 0.5, 0.5));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceCMYK());
});

test("整数 `1 0 0 0 k` を実行すると fillColor=Color.cmyk(1, 0, 0, 0) になり warnings は空", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "k",
    kHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("1 0 0 0 k"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.cmyk(1, 0, 0, 0));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceCMYK());
});

test("`0.5 0.5 0.5 0.5 k` 実行後、strokeColor / strokeColorSpace は初期値のまま", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "k",
    kHandler,
  );
  assert(registered.ok);

  const baseStack = GraphicsStateStack.create();
  const initial = GraphicsStateStack.current(baseStack);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.5 0.5 0.5 0.5 k"),
    registry: registered.value,
  });
  assert(result.ok);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.strokeColor).toEqual(initial.strokeColor);
  expect(current.strokeColorSpace).toEqual(initial.strokeColorSpace);
});
