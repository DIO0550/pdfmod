import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { KHandler } from "../stroke";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("`0.5 0.5 0.5 0.5 K` を実行すると strokeColor=Color.cmyk(0.5, 0.5, 0.5, 0.5) に更新される", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "K",
    KHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.5 0.5 0.5 0.5 K"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.strokeColor).toEqual(Color.cmyk(0.5, 0.5, 0.5, 0.5));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceCMYK());
});

test("整数 `1 0 0 0 K` を実行すると strokeColor=Color.cmyk(1, 0, 0, 0) になり warnings は空", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "K",
    KHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("1 0 0 0 K"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.strokeColor).toEqual(Color.cmyk(1, 0, 0, 0));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceCMYK());
});
