import { assert, expect, test } from "vitest";
import {
  GraphicsStateStack,
  TextObject,
  TextRenderingMode,
} from "../../../../graphics-state/index";
import type { ContentStreamInterpreterResult } from "../../../../interpreter/index";
import { ContentStreamInterpreter } from "../../../../interpreter/index";
import { OperatorRegistry } from "../../../../operator-registry/index";
import { registerTextStateOperators } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

// registerTextStateOperators で全 operator を登録した registry で content stream を
// 実行し、成功結果を返すテストヘルパ。失敗時は assert で即座に検出する。
const execute = (stream: string): ContentStreamInterpreterResult => {
  const registered = registerTextStateOperators(OperatorRegistry.create());
  assert(registered.ok);

  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: registered.value,
  });
  assert(result.ok);
  return result.value;
};

test("全 9 operator を含む content stream を実行すると textState と textObject が遷移する", () => {
  const executed = execute("BT /F1 12 Tf 2 Tc 3 Tw 200 Tz 14 TL 1 Tr 5 Ts ET");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );

  // Tf: フォント名（Option）とサイズ
  assert(current.textState.fontName.some);
  expect(current.textState.fontName.value).toBe("F1");
  expect(current.textState.fontSize).toBe(12);

  // Tc / Tw: 文字間隔・単語間隔
  expect(current.textState.charSpace).toBe(2);
  expect(current.textState.wordSpace).toBe(3);

  // Tz: 水平スケール（デフォルト 100 と異なる 200 で変化を観測）
  expect(current.textState.horizontalScaling).toBe(200);

  // TL / Ts: 行送り・テキスト上昇
  expect(current.textState.leading).toBe(14);
  expect(current.textState.rise).toBe(5);

  // Tr: レンダリングモード（STROKE=1、デフォルト FILL=0 と差を観測）
  expect(current.textState.renderingMode).toBe(
    TextRenderingMode.create(TextRenderingMode.STROKE),
  );

  // ET 後: textObject は非 active
  expect(TextObject.isActive(current.textObject)).toBe(false);
});

// 個別 operator の content stream で対応する textState 数値フィールドのみが
// 更新されることを検証する。全部入り stream（上記）が登録漏れ・実行漏れを担保し、
// こちらは失敗時に原因 operator を特定できる粒度を担保する。
test.each<
  readonly [
    string,
    "charSpace" | "wordSpace" | "horizontalScaling" | "leading" | "rise",
    number,
  ]
>([
  ["2 Tc", "charSpace", 2],
  ["3 Tw", "wordSpace", 3],
  ["200 Tz", "horizontalScaling", 200],
  ["14 TL", "leading", 14],
  ["5 Ts", "rise", 5],
])("単体 content stream '%s' を実行すると textState.%s が更新される", (stream, field, expected) => {
  const executed = execute(stream);
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(current.textState[field]).toBe(expected);
});

test("単体 content stream '/F1 12 Tf' を実行すると fontName と fontSize が更新される", () => {
  const executed = execute("/F1 12 Tf");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  assert(current.textState.fontName.some);
  expect(current.textState.fontName.value).toBe("F1");
  expect(current.textState.fontSize).toBe(12);
});

test("単体 content stream '1 Tr' を実行すると renderingMode が STROKE になる", () => {
  const executed = execute("1 Tr");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(current.textState.renderingMode).toBe(
    TextRenderingMode.create(TextRenderingMode.STROKE),
  );
});

test("単体 content stream 'BT' を実行すると textObject が active になる", () => {
  const executed = execute("BT");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(TextObject.isActive(current.textObject)).toBe(true);
});

test("content stream 'BT ET' を実行すると textObject が非 active になる", () => {
  const executed = execute("BT ET");
  expect(executed.warnings).toEqual([]);

  const current = GraphicsStateStack.current(
    executed.context.graphicsStateStack,
  );
  expect(TextObject.isActive(current.textObject)).toBe(false);
});
