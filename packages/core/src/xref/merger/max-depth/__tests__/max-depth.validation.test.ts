import { assert, expect, test } from "vitest";
import { MaxDepth } from "../index";

test("MaxDepth.create(undefined) は MaxDepth.DEFAULT を含む Ok を返す", () => {
  // 未指定経路: undefined を渡すと default 100 が採用される
  const result = MaxDepth.create(undefined);

  assert(result.ok);
  expect(result.value).toBe(MaxDepth.DEFAULT);
});

test.each([
  1,
  42,
  100,
  Number.MAX_SAFE_INTEGER,
])("正の safe integer %s は同値を Brand 化した Ok を返す", (n) => {
  // 正常系: 有効な正整数は Brand 化されて返る
  const result = MaxDepth.create(n);

  assert(result.ok);
  expect(result.value as number).toBe(n);
});

test.each([
  0,
  -1,
  1.5,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("不正値 %s は XREF_MAX_DEPTH_INVALID を返す", (invalid) => {
  // 異常系: 0 / 負数 / 非整数 / ±Infinity / safe integer 超過は全て Err
  const result = MaxDepth.create(invalid);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_MAX_DEPTH_INVALID");
});

test("MaxDepth.create(NaN) は XREF_MAX_DEPTH_INVALID を返す", () => {
  // NaN は test.each の label 表示が壊れるため単独で検証
  const result = MaxDepth.create(NaN);

  assert(!result.ok);
  expect(result.error.code).toBe("XREF_MAX_DEPTH_INVALID");
});

test("XREF_MAX_DEPTH_INVALID の message に invalid 値が含まれる", () => {
  // 検証補助: エラーメッセージから何が invalid だったかが分かる
  const result = MaxDepth.create(-1);

  assert(!result.ok);
  expect(result.error.message).toContain("-1");
});

test("MaxDepth.DEFAULT は 100 に等しい", () => {
  // 定数値の契約: DEFAULT は 100（既存 mergeXRefChain の default 動作と同値）
  expect(MaxDepth.DEFAULT as number).toBe(100);
});
