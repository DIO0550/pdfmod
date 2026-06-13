import { assert, expect, test } from "vitest";
import { flatMap } from "../../../../../utils/result/index";
import {
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import type { ContentStreamInterpreterResult } from "../../../../interpreter/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerTextStateOperators } from "../../text-state-operators/index";
import { registerTextPositioningOperators } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

// text-state（BT/ET/TL 等）と text-positioning の両 barrel を併用登録した registry を
// 作るテストヘルパ。登録失敗は assert で即座に検出する。
const createRegistry = (): OperatorRegistry => {
  const registered = flatMap(
    registerTextStateOperators(OperatorRegistry.create()),
    registerTextPositioningOperators,
  );
  assert(registered.ok);
  return registered.value;
};

// 正常系用: content stream を実行し、成功結果を返すヘルパ（失敗時は assert で即座に検出）。
// 異常系（BT なし Td → Err）はこのヘルパを使わず execute を直接呼んで Err を検証する。
const execute = (stream: string): ContentStreamInterpreterResult => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: createRegistry(),
  });
  assert(result.ok);
  return result.value;
};

test("4 operator 全部入り stream（ET なし）で textMatrix / textLineMatrix と leading が dispatch 経由で更新される", () => {
  // Tm で (72,720) に絶対配置 → TD で (+10,-14) 移動 + leading=14
  // → T* で leading 分改行 (0,-14) → Td で (+5,+5) 移動 = (87,697)。
  // 演算仕様の再検証ではなく 4 operator 全部の影響が dispatch 経由で反映されたことの確認。
  const executed = execute("BT 1 0 0 1 72 720 Tm 10 -14 TD T* 5 5 Td");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 87, 697),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 87, 697),
  );
  expect(current.textState.leading).toBe(14);
});

test("TL（text-state barrel 側）で設定した leading を T* が参照する（両 barrel 併用の実証）", () => {
  // BT のまま終了し active な textObject の matrix を観測する（ET は matrix を
  // identity にリセットするため含めない）。
  const executed = execute("BT 14 TL T*");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});

test("BT なしで Td を実行すると execute が OPERATOR_ILLEGAL_STATE の Err を返す", () => {
  // text object が active でない状態の positioning operator は handler が Err を返し、
  // interpreter はそれをそのまま伝播する（dispatch 経路の代表として Td のみ検証）。
  const result = ContentStreamInterpreter.execute({
    data: encode("10 20 Td"),
    registry: createRegistry(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});

test("全部入り stream に ET を加えると warnings は空のまま textObject が非 active になる", () => {
  // 補助テスト: BT/ET 併用時に UNKNOWN_OPERATOR warning が出ない（= 登録漏れなし）
  // ことと、ET 後に text object が終了状態になることを確認する。
  const executed = execute("BT 1 0 0 1 72 720 Tm 10 -14 TD T* 5 5 Td ET");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(TextObject.isActive(current.textObject)).toBe(false);
});
