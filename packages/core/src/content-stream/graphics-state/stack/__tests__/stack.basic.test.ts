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

  const { stack: restored, warning } = GraphicsStateStack.restore(changed);

  expect(saved).not.toBe(stack);
  expect(changed).not.toBe(saved);
  expect(restored).not.toBe(changed);
  expect(GraphicsStateStack.current(restored)).toEqual(GraphicsState.create());
  expect(warning).toBeUndefined();
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
  const { stack: firstRestore } = GraphicsStateStack.restore(changed);
  const { stack: secondRestore } = GraphicsStateStack.restore(firstRestore);

  expect(GraphicsStateStack.current(firstRestore)).toEqual(second);
  expect(GraphicsStateStack.current(secondRestore)).toEqual(first);
});

test("空スタックの restore は current 不変で UNBALANCED_RESTORE warning を返す", () => {
  // unbalanced Q operator の検出: 戻り値 warning に警告が乗る
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);

  const { stack: restored, warning } = GraphicsStateStack.restore(stack);

  expect(restored).not.toBe(stack);
  expect(GraphicsStateStack.current(restored)).toBe(current);
  expect(warning?.code).toBe("UNBALANCED_RESTORE");
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

test("saved が非空の restore は warning: undefined を返す", () => {
  // 正常な q/Q 対応時は warning 発行なし
  const stack = GraphicsStateStack.create();
  const saved = GraphicsStateStack.save(stack);

  const { warning } = GraphicsStateStack.restore(saved);

  expect(warning).toBeUndefined();
});

test("連続 unbalanced restore はそれぞれ独立に warning を返す", () => {
  // 呼び出しごとに個別 warning が返る（3 回で 3 件）
  const stack = GraphicsStateStack.create();

  const r1 = GraphicsStateStack.restore(stack);
  const r2 = GraphicsStateStack.restore(r1.stack);
  const r3 = GraphicsStateStack.restore(r2.stack);

  expect(r1.warning?.code).toBe("UNBALANCED_RESTORE");
  expect(r2.warning?.code).toBe("UNBALANCED_RESTORE");
  expect(r3.warning?.code).toBe("UNBALANCED_RESTORE");
});
