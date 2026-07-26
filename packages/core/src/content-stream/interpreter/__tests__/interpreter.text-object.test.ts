// 本ファイルは ContentStreamInterpreter.execute（tokenizer → dispatch → registry
// → handler）を通した text object の二重開始と 2 周目ライフサイクルのみを担当する。
// handler 層の BT BT と 2 周目 BT ET は et.integration.test.ts が検証済みで、
// 本ファイルはそこを通らない E2E 経路だけを見る。
// また text-state-operators.integration.test.ts は BT / BT ET の正常系のみを
// E2E で担当しており、異常系（BT BT）は本ファイルが初めて E2E で固定する。
import { assert, expect, test } from "vitest";
import { GraphicsStateStack, TextObject } from "../../graphics-state/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { registerTextStateOperators } from "../../operators/text/text-state-operators/index";
import type { ContentStreamInterpreterResult } from "../index";
import { ContentStreamInterpreter } from "../index";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * text state operator (BT / ET を含む) を registerTextStateOperators で
 * 登録した registry を生成する。登録失敗は assert で即座に検出する。
 */
const buildRegistry = (): OperatorRegistry => {
  const registered = registerTextStateOperators(OperatorRegistry.create());
  assert(registered.ok);
  return registered.value;
};

/**
 * 正常系用: content stream を実行し、成功結果を返すヘルパ（失敗時は assert で
 * 即座に検出）。異常系（BT BT → Err）はこのヘルパを使わず
 * ContentStreamInterpreter.execute を直接呼んで Err を検証する。
 * text-positioning-operators.integration.test.ts と同じ構成。
 *
 * なお execute が err を返す場合、戻り値に warnings は載らないため
 * 異常系では warnings の検証を行わない（できない）。
 */
const execute = (stream: string): ContentStreamInterpreterResult => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: buildRegistry(),
  });
  assert(result.ok);
  return result.value;
};

test("`BT BT` で execute が OPERATOR_ILLEGAL_STATE の err を返す（operatorName / message も pin down）", () => {
  // 未 ET のまま 2 回目の BT を bytes から流すと、dispatch 層が握りつぶさず
  // btHandler の Err がそのまま execute の戻り値へ伝播すること
  // （handler を直接 2 回呼ぶ版は et.integration.test.ts にあり、本 test は
  //   tokenizer / dispatch / registry を通る経路のみを見る）
  const result = ContentStreamInterpreter.execute({
    data: encode("BT BT"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("BT");
  expect(result.error.message).toBe(
    "BT: text object already active (nested BT/ET is not allowed)",
  );
});

test("`BT ET BT ET` は ok で完走し末尾の textObject が非 active", () => {
  // ET で閉じれば 2 周目の BT が通る = BT BT の err がガードの誤発火ではないことの対照
  // 2 周目ライフサイクル自体は et.integration.test.ts が handler 層で検証済み。
  // 本 test は同じ経路が interpreter の E2E でも成立することだけを担当する。
  const executed = execute("BT ET BT ET");

  expect(executed.warnings).toEqual([]);
  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

test("`BT ET BT BT` でも 2 周目の二重 BT が OPERATOR_ILLEGAL_STATE になる", () => {
  // 1 周閉じた後でも active 検査が再び効くこと（ガードの状態リークがない）
  const result = ContentStreamInterpreter.execute({
    data: encode("BT ET BT BT"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("BT");
});

test("`BT foo BT` のように未登録 operator を挟んでも 2 回目の BT が err になる", () => {
  // UNKNOWN_OPERATOR warning を出して継続する経路を通っても
  // graphics state の textObject が active のまま維持されること
  const result = ContentStreamInterpreter.execute({
    data: encode("BT foo BT"),
    registry: buildRegistry(),
  });

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ILLEGAL_STATE");
  expect(result.error.operatorName).toBe("BT");
});
