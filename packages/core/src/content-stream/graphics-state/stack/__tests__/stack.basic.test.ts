import { expect, test } from "vitest";
import type { PdfWarning } from "../../../../pdf/errors/warning/index";
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

test("空スタック restore で warnings 引数を渡すと UNBALANCED_RESTORE が push される", () => {
  // unbalanced Q operator の検出: warnings buffer に警告が積まれる
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);
  const warnings: PdfWarning[] = [];

  const restored = GraphicsStateStack.restore(stack, warnings);

  expect(warnings).toHaveLength(1);
  expect(warnings[0]?.code).toBe("UNBALANCED_RESTORE");
  // 返り値の shape は現状維持: 新しい stack で current 不変・saved 空
  expect(restored).not.toBe(stack);
  expect(GraphicsStateStack.current(restored)).toBe(current);
});

test("空スタック restore で warnings 引数省略時は警告なし（後方互換）", () => {
  // warnings 未指定の既存呼び出しは変更なし・警告なしで no-op
  const stack = GraphicsStateStack.create();
  const current = GraphicsStateStack.current(stack);

  const restored = GraphicsStateStack.restore(stack);

  expect(restored).not.toBe(stack);
  expect(GraphicsStateStack.current(restored)).toBe(current);
});

test("warnings 引数付きで saved が非空時に警告は push されない", () => {
  // 正常な q/Q 対応時は warning 発行なし
  const stack = GraphicsStateStack.create();
  const saved = GraphicsStateStack.save(stack);
  const warnings: PdfWarning[] = [];

  GraphicsStateStack.restore(saved, warnings);

  expect(warnings).toHaveLength(0);
});

test("連続 unbalanced restore で警告が複数 push される", () => {
  // 呼び出しごとに 1 件ずつ積まれる（3 回で 3 件）
  const stack = GraphicsStateStack.create();
  const warnings: PdfWarning[] = [];

  const r1 = GraphicsStateStack.restore(stack, warnings);
  const r2 = GraphicsStateStack.restore(r1, warnings);
  GraphicsStateStack.restore(r2, warnings);

  expect(warnings).toHaveLength(3);
  expect(warnings.every((w) => w.code === "UNBALANCED_RESTORE")).toBe(true);
});
