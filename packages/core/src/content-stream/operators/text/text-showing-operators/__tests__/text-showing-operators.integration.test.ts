import { assert, expect, test } from "vitest";
import { flatMap } from "../../../../../utils/result/index";
import {
  GraphicsStateStack,
  Matrix,
  TextObject,
} from "../../../../graphics-state/index";
import type { ContentStreamInterpreterResult } from "../../../../interpreter/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerTextPositioningOperators } from "../../text-positioning-operators/index";
import { registerTextStateOperators } from "../../text-state-operators/index";
import { registerTextShowingOperators } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

// text-state（BT/ET/TL 等）+ text-positioning（Tm 等）+ text-showing の
// 3 barrel を併用登録した registry を作るテストヘルパ。
// 登録失敗は assert で即座に検出する。
const createRegistry = (): OperatorRegistry => {
  const withState = registerTextStateOperators(OperatorRegistry.create());
  const withPositioning = flatMap(withState, registerTextPositioningOperators);
  const registered = flatMap(withPositioning, registerTextShowingOperators);
  assert(registered.ok);
  return registered.value;
};

// 正常系用: content stream を実行し成功結果を返すヘルパ（失敗時は assert で即座に検出）。
// 異常系（BT 外 Tj → Err）はこのヘルパを使わず execute を直接呼んで Err を検証する。
const execute = (
  stream: string,
  initialContext?: OperatorHandlerContext,
): ContentStreamInterpreterResult => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: createRegistry(),
    initialContext,
  });
  assert(result.ok);
  return result.value;
};

test("TJ: barrel が TJ を登録し stream 内の配列リテラル `[...]` を tjArrayHandler が消費し textMatrix を水平移動する", () => {
  // シナリオ 1: stream に配列リテラル `[(H) 40 (ello)]` を直接含める。
  // interpreter が `[ ... ]` を PdfArray として組み立てるため、
  // initialContext で operand を事前 push する必要はない。
  // - /F1 12 Tf: fontSize=12 を設定（fontSize=0 だと TJ 数値要素の textMatrix 移動量が常に 0 になり short-circuit する）
  // - Tm で (72, 720) に絶対配置
  // - TJ で reader が組み立てた配列を pop し、数値要素 40 を反映して textMatrix.e を移動
  // ET は含めない（ET は textMatrix / textLineMatrix を identity にリセットするため、移動結果を観測できなくなる）。
  const executed = execute("BT /F1 12 Tf 1 0 0 1 72 720 Tm [(H) 40 (ello)] TJ");
  // UNKNOWN_OPERATOR が一切出ていない = barrel が 4 operator (および Tf/Tm/BT) を正しく登録した
  expect(executed.warnings).toEqual([]);

  // tjArrayHandler が dispatch されて配列を pop した結果、operand stack は空。
  // operand stack は context 直下にあり、GraphicsState の中ではない。
  expect(OperandStack.depth(executed.context.operandStack)).toBe(0);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  // BT 後 ET なしのため、text object は active のまま。
  expect(TextObject.isActive(current.textObject)).toBe(true);
  // Tm で (72, 720) に絶対配置 → TJ の数値要素 40 が `textMatrix.e` を `-40 * fontSize / 1000 = -0.48` 移動。
  // 結果: textMatrix.e === 72 + (-40 * 12 / 1000) === 71.52
  // e のみ浮動小数演算の丸め誤差が乗るため `toBeCloseTo` で検証する。
  // 残りの 5 成分 (a/b/c/d/f) は Tm の整数値そのままなので等値比較で良い。
  // Matrix は `[a, b, c, d, e, f]` のタプル表現。
  const [a, b, c, d, e, f] = current.textObject.textMatrix;
  expect(a).toBe(1);
  expect(b).toBe(0);
  expect(c).toBe(0);
  expect(d).toBe(1);
  expect(f).toBe(720);
  expect(e).toBeCloseTo(71.52);
});

test("': BT 14 TL (Hi) ' で改行 (leading=14) が発生する", () => {
  // シナリオ 2: ' は (Hi) の描画 + T* 相当の改行を発生させる。
  // ET なし → textLineMatrix の最終状態を観測する。
  const executed = execute("BT 14 TL (Hi) '");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  // ' の T* 相当処理で leading=14 を反映し、textLineMatrix.f = -14 へ移動。
  // textMatrix も同じ位置（' の Tj は文字列描画のみで matrix を動かさず、
  // 続く T* 相当処理が textMatrix = textLineMatrix とする既存仕様）。
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textObject.textMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
  expect(current.textState.leading).toBe(14);
});

test('": BT 14 TL 2 1 (Hi) " で wordSpace=2 / charSpace=1 を設定し改行する', () => {
  // シナリオ 3: " は aw=2, ac=1, string の 3 operand で wordSpace / charSpace を更新し
  // ' 相当の (Hi) + 改行を発生させる。ET なしで最終 textState / textLineMatrix を観測。
  const executed = execute('BT 14 TL 2 1 (Hi) "');
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(current.textState.wordSpace).toBe(2);
  expect(current.textState.charSpace).toBe(1);
  expect(current.textState.leading).toBe(14);
  // " の改行 (T* 相当) で textLineMatrix.f = -14。
  expect(current.textObject.textLineMatrix).toEqual(
    Matrix.create(1, 0, 0, 1, 0, -14),
  );
});

// シナリオ 4: BT 外で **登録した 4 operator すべて**を実行 → 各 handler の active 検査で fail。
// barrel が 4 operator を正しく登録し、かつ 4 つすべてが interpreter 経由で
// active 検査エラーを返すことを test.each で網羅する（UNKNOWN_OPERATOR ではなく
// OPERATOR_ILLEGAL_STATE が返ることが barrel 登録の確証になる）。
// 異常系のため execute ヘルパは使わず ContentStreamInterpreter.execute を直接呼ぶ。
test.each<readonly [string, string]>([
  // [operator, BT 外 stream]
  // TJ は reader が `[...]` を PdfArray として組み立てた上で BT 外検査に到達する
  ["Tj", "(Hi) Tj"],
  ["TJ", "[(H) 40 (ello)] TJ"],
  ["'", "(Hi) '"],
  ['"', '2 1 (Hi) "'],
])("%s: BT なしで実行すると execute が OPERATOR_ILLEGAL_STATE の Err を返す", (_name, stream) => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: createRegistry(),
  });

  assert(!result.ok);
  expect(result.error.code).toBe("OPERATOR_ILLEGAL_STATE");
});
