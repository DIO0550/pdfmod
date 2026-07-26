// 本ファイルは 2 観点を担当する:
//   (i)  probe handler で実行途中の markedContentStack を捕捉し、interpreter 経由で
//        組み立てられた entry の properties（3 バリアント）を観測する
//   (ii) 深度 3 のネストが interpreter 経由で完走することを検証する
// (ii) を本ファイルに含めるのは要件確定時の方針。
// 3 観点目が必要になった時点でファイル分割を検討すること。
//
// interpreter.marked-content.test.ts は depth と error message のみを観測し
// entry の中身は一度も見ていない（ネストも深度 2 まで）。本ファイルは
// 「interpreter 経由で組み立てられた entry の中身」と「深度 3 ネスト」を担当する。
//
// probe を使う test では captured[0] にアクセスする前に必ず
// expect(captured).toHaveLength(1) を置く（noUncheckedIndexedAccess 未設定のため
// probe 未発火時に型エラーにならず読めない TypeError になるのを防ぐ）。
import { assert, expect, test } from "vitest";
import { ok } from "../../../utils/result/index";
import { MarkedContentStack } from "../../marked-content/stack";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../operator-registry/index";
import { registerMarkedContentOperators } from "../../operators/marked-content/marked-content-operators/index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

// interpreter.dispatch.test.ts / interpreter.dict-operand.test.ts /
// interpreter.inline-image.test.ts と完全同一シグネチャのヘルパ。
// 共有モジュール化は本 PR のスコープ外のため、独自シグネチャを作らず踏襲する。
function registerOperator(
  registry: ReturnType<typeof OperatorRegistry.create>,
  name: string,
  handler: OperatorHandler,
): ReturnType<typeof OperatorRegistry.create> {
  const result = OperatorRegistry.register(registry, name, handler);
  assert(result.ok);
  return result.value;
}

/**
 * marked-content operator に加えて、実行途中の markedContentStack を
 * クロージャへ捕捉する `probe` operator を登録した registry を生成する。
 *
 * execute の戻り値からは BDC が積んだ entry を観測できない
 * （EMC で閉じれば消え、閉じなければ EOF 検査の err で context 自体が返らない）。
 * そのため実行途中に割り込む probe handler で観測する。
 * probe は context をそのまま ok で返すため後続の EMC / EOF 検査に影響しない。
 * `probe` は BMC / EMC / BDC / MP / DP のいずれとも衝突しない名前を選んでいる。
 */
const buildRegistryWithProbe = (
  captured: MarkedContentStack[],
): OperatorRegistry => {
  const registered = registerMarkedContentOperators(OperatorRegistry.create());
  assert(registered.ok);
  return registerOperator(registered.value, "probe", (context) => {
    captured.push(context.markedContentStack);
    return ok(context);
  });
};

test("`/Span /P1 BDC probe EMC` の probe 時点で entry の tag が /Span・properties が some(/P1)", () => {
  // tokenizer → operand stack → bdcHandler の経路を通しても
  // 名前参照形 properties が resource 解決されず /P1 のまま積まれること
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span /P1 BDC probe EMC"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  const popped = MarkedContentStack.pop(captured[0]);
  assert(popped.some);
  expect(popped.value.popped.tag).toEqual({ type: "name", value: "Span" });
  assert(popped.value.popped.properties.some);
  expect(popped.value.popped.properties.value).toEqual({
    type: "name",
    value: "P1",
  });
});

test("`/Span /P1 BDC probe EMC` は probe がちょうど 1 回発火し probe 時 depth 1・完走時 depth 0", () => {
  // BDC が 1 件だけ積み EMC が確実に閉じること（probe 自体は depth に影響しない）
  // 完走時 depth 0 / warnings 空という観測自体は interpreter.marked-content.test.ts が
  // 既に持っている。本 test の新規性は「probe がちょうど 1 回発火する」ことと
  // 「probe 時点（EMC 前）の depth が 1 である」ことの 2 点にある。
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span /P1 BDC probe EMC"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  expect(MarkedContentStack.depth(captured[0])).toBe(1);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("`/Span <</MCID 0>> BDC probe EMC` の probe 時点で properties が dictionary バリアント", () => {
  // 辞書形と名前形が dispatch 経路で正しく分岐すること（名前形テストの対照）
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span <</MCID 0>> BDC probe EMC"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  const popped = MarkedContentStack.pop(captured[0]);
  assert(popped.some);
  assert(popped.value.popped.properties.some);
  expect(popped.value.popped.properties.value.type).toBe("dictionary");
});

test("`/Span BMC probe EMC` の probe 時点で properties が none", () => {
  // BMC 由来 entry は properties を持たないこと（3 バリアント目の対照）
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span BMC probe EMC"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  const popped = MarkedContentStack.pop(captured[0]);
  assert(popped.some);
  expect(popped.value.popped.properties).toEqual({ some: false });
});

test("3 段ネスト `/A BMC /B BMC /C BMC EMC EMC EMC` で初期状態に復帰する", () => {
  // 深度 3 のネストが interpreter 経由でも過不足なく開閉し、末尾 depth 0・
  // warnings 空になること（graphics-state-operators.integration.test.ts の
  // 3 段ネスト test と同型のシナリオを marked content 側で行う）
  // この test は stream に probe を含めないため捕捉先の配列は空のまま使わない。
  const result = ContentStreamInterpreter.execute({
    data: encode("/A BMC /B BMC /C BMC EMC EMC EMC"),
    registry: buildRegistryWithProbe([]),
  });

  assert(result.ok);
  expect(result.value.warnings).toEqual([]);
  expect(
    MarkedContentStack.depth(result.value.context.markedContentStack),
  ).toBe(0);
});

test("深度 3 混在ネストの probe 時点で depth 3・LIFO で /C(some name) → /B(some dict) → /A(none)", () => {
  // `/A BMC /B <<>> BDC /C /P1 BDC probe EMC EMC EMC` で
  // 3 バリアントが積まれた順に対応して取り出せること（stack 単体の深度 3 検証の E2E 対応）
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/A BMC /B <<>> BDC /C /P1 BDC probe EMC EMC EMC"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  expect(MarkedContentStack.depth(captured[0])).toBe(3);

  const inner = MarkedContentStack.pop(captured[0]);
  assert(inner.some);
  expect(inner.value.popped.tag.value).toBe("C");
  assert(inner.value.popped.properties.some);
  expect(inner.value.popped.properties.value).toEqual({
    type: "name",
    value: "P1",
  });

  const middle = MarkedContentStack.pop(inner.value.stack);
  assert(middle.some);
  expect(middle.value.popped.tag.value).toBe("B");
  assert(middle.value.popped.properties.some);
  expect(middle.value.popped.properties.value.type).toBe("dictionary");

  const outer = MarkedContentStack.pop(middle.value.stack);
  assert(outer.some);
  expect(outer.value.popped.tag.value).toBe("A");
  expect(outer.value.popped.properties).toEqual({ some: false });
});

test("`/Span /P1 BDC EMC probe` の probe 時点では depth 0 で pop が none", () => {
  // EMC が確実に pop していること = probe 方式が古い stack 参照を見ていないことの確証
  const captured: MarkedContentStack[] = [];
  const result = ContentStreamInterpreter.execute({
    data: encode("/Span /P1 BDC EMC probe"),
    registry: buildRegistryWithProbe(captured),
  });

  assert(result.ok);
  expect(captured).toHaveLength(1);
  expect(MarkedContentStack.depth(captured[0])).toBe(0);
  expect(MarkedContentStack.pop(captured[0])).toEqual({ some: false });
});
