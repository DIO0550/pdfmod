import { expectTypeOf, test } from "vitest";
import { GraphicsState, GraphicsStateStack } from "../../index";

test("GraphicsStateStack は Brand を持たず readonly な current と saved だけを持つ", () => {
  expectTypeOf<GraphicsStateStack>().toEqualTypeOf<{
    readonly current: GraphicsState;
    readonly saved: ReadonlyArray<GraphicsState>;
  }>();
});

test("GraphicsStateStack の saved に状態を積めない", () => {
  const stack = GraphicsStateStack.create();
  // @ts-expect-error saved は ReadonlyArray
  stack.saved.push(GraphicsState.create());
});

test("GraphicsStateStack の current は再代入できない", () => {
  const stack = GraphicsStateStack.create();
  // @ts-expect-error current は readonly
  stack.current = GraphicsState.create();
});
