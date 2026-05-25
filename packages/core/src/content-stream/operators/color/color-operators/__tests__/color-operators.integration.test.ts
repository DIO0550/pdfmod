import { assert, expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerColorOperators } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

test("0.5 G を実行すると strokeColor が Color.gray(0.5) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.5 G"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.strokeColor).toEqual(Color.gray(0.5));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceGray());
});

test("0.5 g を実行すると fillColor が Color.gray(0.5) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0.5 g"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.gray(0.5));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceGray());
});

test("0 0 1 RG を実行すると strokeColor が Color.rgb(0, 0, 1) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("0 0 1 RG"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.strokeColor).toEqual(Color.rgb(0, 0, 1));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceRGB());
});

test("1 0 0 rg を実行すると fillColor が Color.rgb(1, 0, 0) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
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

test("1 0 0 rg 0 0 1 RG を実行すると fillColor と strokeColor が両方更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("1 0 0 rg 0 0 1 RG"),
    registry: registered.value,
  });
  assert(result.ok);
  expect(result.value.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.fillColor).toEqual(Color.rgb(1, 0, 0));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceRGB());
  expect(current.strokeColor).toEqual(Color.rgb(0, 0, 1));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceRGB());
});

test("0.5 0.5 0.5 0.5 K を実行すると strokeColor が Color.cmyk(0.5, 0.5, 0.5, 0.5) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
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

test("0.5 0.5 0.5 0.5 k を実行すると fillColor が Color.cmyk(0.5, 0.5, 0.5, 0.5) に更新される", () => {
  const registered = registerColorOperators(OperatorRegistry.create());
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
