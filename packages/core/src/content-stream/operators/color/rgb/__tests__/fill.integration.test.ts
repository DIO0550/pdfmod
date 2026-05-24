import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { rgHandler } from "../fill";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("`1 0 0 rg` を実行すると fillColor が Color.rgb(1, 0, 0) に更新される", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "rg",
    rgHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("1 0 0 rg"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.rgb(1, 0, 0));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceRGB());
});

test("`0.1 0.2 0.3 rg` を実行すると fillColor が Color.rgb(0.1, 0.2, 0.3) になり warnings は空", () => {
  const registered = OperatorRegistry.register(
    OperatorRegistry.create(),
    "rg",
    rgHandler,
  );
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.1 0.2 0.3 rg"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.rgb(0.1, 0.2, 0.3));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceRGB());
});
