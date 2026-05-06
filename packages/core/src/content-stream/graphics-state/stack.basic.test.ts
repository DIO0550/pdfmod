import { expect, test } from "vitest";
import { none } from "../../utils/option/index";
import { GraphicsState, LineCap } from "./index";
import { GraphicsStateStack } from "./stack";

test("createはデフォルトGraphicsStateをcurrentに持つ", () => {
  const stack = GraphicsStateStack.create();

  expect(GraphicsStateStack.current(stack)).toEqual(GraphicsState.create());
});

test("save後restoreは保存時のcurrentへ戻す", () => {
  const stack = GraphicsStateStack.create();
  GraphicsStateStack.save(stack);
  GraphicsStateStack.replaceCurrent(
    stack,
    GraphicsState.update(GraphicsStateStack.current(stack), {
      lineCap: LineCap.create(2),
      lineWidth: 3.0,
    }),
  );

  const error = GraphicsStateStack.restore(stack);

  expect(error).toEqual(none);
  expect(GraphicsStateStack.current(stack)).toEqual(GraphicsState.create());
});

test("restoreはLIFO順に保存状態へ戻す", () => {
  const stack = GraphicsStateStack.create();
  const first = GraphicsState.update(GraphicsStateStack.current(stack), {
    lineWidth: 2.0,
  });
  const second = GraphicsState.update(first, { lineWidth: 4.0 });

  GraphicsStateStack.replaceCurrent(stack, first);
  GraphicsStateStack.save(stack);
  GraphicsStateStack.replaceCurrent(stack, second);
  GraphicsStateStack.save(stack);
  GraphicsStateStack.replaceCurrent(
    stack,
    GraphicsState.update(second, { lineWidth: 8.0 }),
  );

  expect(GraphicsStateStack.restore(stack)).toEqual(none);
  expect(GraphicsStateStack.current(stack)).toEqual(second);
  expect(GraphicsStateStack.restore(stack)).toEqual(none);
  expect(GraphicsStateStack.current(stack)).toEqual(first);
});

test("空スタックのrestoreはcurrentを変更しない", () => {
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);

  const error = GraphicsStateStack.restore(stack);

  expect(error).toEqual(none);
  expect(GraphicsStateStack.current(stack)).toBe(current);
});
