import { expect, test } from "vitest";
import {
  Color,
  ColorSpace,
  CurrentPath,
  DashPattern,
  GraphicsState,
  LineCap,
  LineJoin,
  Matrix,
  TextObject,
  TextState,
} from "../../index";
import { PathSegment } from "../../path-segment";

test("createはPDF仕様準拠のデフォルト値を返す", () => {
  const state = GraphicsState.create();
  expect(state).toEqual({
    ctm: Matrix.identity(),
    lineWidth: 1.0,
    lineCap: LineCap.create(0),
    lineJoin: LineJoin.create(0),
    miterLimit: 10.0,
    dashPattern: DashPattern.solid(),
    currentPath: CurrentPath.empty(),
    strokeColor: Color.defaultBlack(),
    fillColor: Color.defaultBlack(),
    strokeColorSpace: ColorSpace.deviceGray(),
    fillColorSpace: ColorSpace.deviceGray(),
    textState: TextState.create(),
    textObject: TextObject.inactive(),
  });
});

test("updateは指定したフィールドだけを書き換える", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated.lineWidth).toBe(2.0);
});

test("updateは未指定フィールドを保持する", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated.ctm).toBe(state.ctm);
  expect(updated.lineCap).toBe(state.lineCap);
  expect(updated.lineJoin).toBe(state.lineJoin);
  expect(updated.miterLimit).toBe(state.miterLimit);
  expect(updated.dashPattern).toBe(state.dashPattern);
  expect(updated.currentPath).toBe(state.currentPath);
});

test("updateは元のstateを変更しない", () => {
  const state = GraphicsState.create();
  GraphicsState.update(state, { lineWidth: 2.0 });
  expect(state.lineWidth).toBe(1.0);
});

test("updateは新しいインスタンスを返す", () => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, { lineWidth: 2.0 });
  expect(updated).not.toBe(state);
});

test.each([
  ["lineWidth", { lineWidth: 3.5 }],
  ["lineCap", { lineCap: LineCap.create(1) }],
  ["lineJoin", { lineJoin: LineJoin.create(2) }],
  ["miterLimit", { miterLimit: 5.0 }],
  ["dashPattern", { dashPattern: DashPattern.create([2, 1], 0) }],
  ["ctm", { ctm: Matrix.create(2, 0, 0, 2, 0, 0) }],
  [
    "currentPath",
    {
      currentPath: CurrentPath.append(
        CurrentPath.empty(),
        PathSegment.moveTo(1, 2),
      ),
    },
  ],
  ["strokeColor", { strokeColor: Color.rgb(1, 0, 0) }],
  ["fillColor", { fillColor: Color.cmyk(0, 1, 1, 0) }],
  ["strokeColorSpace", { strokeColorSpace: ColorSpace.deviceRGB() }],
  ["fillColorSpace", { fillColorSpace: ColorSpace.deviceCMYK() }],
  [
    "textState",
    { textState: TextState.update(TextState.create(), { charSpace: 2 }) },
  ],
  ["textObject", { textObject: TextObject.begin() }],
  ["empty", {}],
] as const)("update(state, %s) は該当フィールドだけ書き換える", (_label, partial) => {
  const state = GraphicsState.create();
  const updated = GraphicsState.update(state, partial);
  expect(updated).toEqual({ ...state, ...partial });
});

test("update({ currentPath }) は currentPath を書き換える", () => {
  const state = GraphicsState.create();
  const newPath = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(10, 20),
  );
  const updated = GraphicsState.update(state, { currentPath: newPath });
  expect(updated.currentPath).toBe(newPath);
});

test("update は currentPath 未指定で既存値を保持する", () => {
  const initial = GraphicsState.update(GraphicsState.create(), {
    currentPath: CurrentPath.append(
      CurrentPath.empty(),
      PathSegment.moveTo(1, 2),
    ),
  });
  const updated = GraphicsState.update(initial, { lineWidth: 3.0 });
  expect(updated.currentPath).toBe(initial.currentPath);
});

test("updateはundefinedの明示指定で既存フィールドを壊さない", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  const dashPattern = DashPattern.create([2, 1], 0);
  const strokeColor = Color.rgb(1, 0, 0);
  const fillColor = Color.cmyk(0, 1, 1, 0);
  const strokeColorSpace = ColorSpace.deviceRGB();
  const fillColorSpace = ColorSpace.deviceCMYK();
  const textState = TextState.update(TextState.create(), { charSpace: 2 });
  const textObject = TextObject.begin();
  const state = GraphicsState.update(GraphicsState.create(), {
    lineWidth: 2.0,
    miterLimit: 5.0,
    dashPattern,
    currentPath: path,
    strokeColor,
    fillColor,
    strokeColorSpace,
    fillColorSpace,
    textState,
    textObject,
  });
  const updated = GraphicsState.update(state, {
    lineWidth: undefined,
    miterLimit: undefined,
    dashPattern: undefined,
    currentPath: undefined,
    strokeColor: undefined,
    fillColor: undefined,
    strokeColorSpace: undefined,
    fillColorSpace: undefined,
    textState: undefined,
    textObject: undefined,
  });
  expect(updated.lineWidth).toBe(2.0);
  expect(updated.miterLimit).toBe(5.0);
  expect(updated.dashPattern).toEqual(dashPattern);
  expect(updated.currentPath).toBe(path);
  expect(updated.strokeColor).toBe(strokeColor);
  expect(updated.fillColor).toBe(fillColor);
  expect(updated.strokeColorSpace).toBe(strokeColorSpace);
  expect(updated.fillColorSpace).toBe(fillColorSpace);
  expect(updated.textState).toBe(textState);
  expect(updated.textObject).toBe(textObject);
});
