import { assert, expect, test } from "vitest";
import { CurrentPath } from "../../../../graphics-state/current-path/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
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

test("補正済みの v/y シーケンスを実行すると path 構築から painting まで完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 120 120 150 50 v 180 180 200 100 y h f"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("v/y の segment が期待する制御点へ正規化される", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 150 50 200 200 v 250 250 300 300 y"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(100, 100),
    PathSegment.curveTo(100, 100, 150, 50, 200, 200),
    PathSegment.curveTo(250, 250, 300, 300, 300, 300),
  ]);
});

test("re h の後の v は rect の subpath 開始点を第1制御点にする", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("10 10 100 50 re h 120 60 140 80 v"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([
    PathSegment.rect(10, 10, 100, 50),
    PathSegment.close(),
    PathSegment.curveTo(10, 10, 120, 60, 140, 80),
  ]);
});

test("100 100 m 200 200 l s が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l s"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    result.value.context.graphicsStateStack,
  );
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("100 100 300 400 re f* が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 300 400 re f*"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("100 100 300 400 re F が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 300 400 re F"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("100 100 300 400 re B* が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 300 400 re B*"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("100 100 m 200 200 l b が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l b"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("100 100 m 200 200 l b* が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l b*"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("100 100 300 400 re n が warning なく完走する", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 300 400 re n"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("s と h S が同じ GraphicsState になる", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const closeStrokeResult = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l s"),
    registry: registered.value,
  });
  const closeThenStrokeResult = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l h S"),
    registry: registered.value,
  });

  assert(closeStrokeResult.ok);
  assert(closeThenStrokeResult.ok);
  expect(
    GraphicsStateStack.current(
      closeStrokeResult.value.context.graphicsStateStack,
    ),
  ).toEqual(
    GraphicsStateStack.current(
      closeThenStrokeResult.value.context.graphicsStateStack,
    ),
  );
});

test("f* / B* / b* が 1 token として読まれる", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode(
      "100 100 300 400 re f* 100 100 300 400 re B* 100 100 m 200 200 l b*",
    ),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("paint 後に path 構築を再開できる", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m n 300 300 m 400 400 l f"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.context.graphicsStateStack)
        .currentPath,
    ),
  ).toBe(true);
});

test("7つのpaint variantsを並べても UNKNOWN_OPERATOR warning が出ない", () => {
  const registered = registerPathOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode("100 100 m 200 200 l s f* F B* b b* n"),
    registry: registered.value,
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
});
