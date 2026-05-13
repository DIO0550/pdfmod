import { expect, test } from "vitest";
import { GraphicsState, LineCap } from "../../index";
import { GraphicsStateStack } from "../../stack";

test("createはデフォルトGraphicsStateをcurrentに持つ", () => {
  const stack = GraphicsStateStack.create();

  expect(GraphicsStateStack.current(stack)).toEqual(GraphicsState.create());
});

test("save後restoreは保存時のcurrentへ戻す", () => {
  const stack = GraphicsStateStack.create();
  const saved = GraphicsStateStack.save(stack);
  const changed = GraphicsStateStack.replaceCurrent(
    saved,
    GraphicsState.update(GraphicsStateStack.current(stack), {
      lineCap: LineCap.create(2),
      lineWidth: 3.0,
    }),
  );

  const restored = GraphicsStateStack.restore(changed);

  expect(saved).not.toBe(stack);
  expect(changed).not.toBe(saved);
  expect(restored).not.toBe(changed);
  expect(GraphicsStateStack.current(restored)).toEqual(GraphicsState.create());
});

test("restoreはLIFO順に保存状態へ戻す", () => {
  const stack = GraphicsStateStack.create();
  const first = GraphicsState.update(GraphicsStateStack.current(stack), {
    lineWidth: 2.0,
  });
  const second = GraphicsState.update(first, { lineWidth: 4.0 });

  const firstCurrent = GraphicsStateStack.replaceCurrent(stack, first);
  const firstSaved = GraphicsStateStack.save(firstCurrent);
  const secondCurrent = GraphicsStateStack.replaceCurrent(firstSaved, second);
  const secondSaved = GraphicsStateStack.save(secondCurrent);
  const changed = GraphicsStateStack.replaceCurrent(
    secondSaved,
    GraphicsState.update(second, { lineWidth: 8.0 }),
  );
  const firstRestore = GraphicsStateStack.restore(changed);
  const secondRestore = GraphicsStateStack.restore(firstRestore);

  expect(GraphicsStateStack.current(firstRestore)).toEqual(second);
  expect(GraphicsStateStack.current(secondRestore)).toEqual(first);
});

test("空スタックのrestoreはcurrentを変更しない", () => {
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);

  const restored = GraphicsStateStack.restore(stack);

  expect(restored).not.toBe(stack);
  expect(GraphicsStateStack.current(restored)).toBe(current);
});

test("replaceCurrentは元stackを変更しない", () => {
  const stack = GraphicsStateStack.create();
  const next = GraphicsState.update(GraphicsStateStack.current(stack), {
    lineWidth: 2.0,
  });

  const updated = GraphicsStateStack.replaceCurrent(stack, next);

  expect(updated).not.toBe(stack);
  expect(GraphicsStateStack.current(stack)).toEqual(GraphicsState.create());
  expect(GraphicsStateStack.current(updated)).toEqual(next);
});
