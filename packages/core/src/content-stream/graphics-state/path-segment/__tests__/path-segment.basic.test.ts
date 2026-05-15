import { expect, test } from "vitest";
import { PathSegment } from "../../path-segment";

test.each([
  [0, 0],
  [100.5, -42],
])("PathSegment.moveTo(%s, %s) は moveTo segment を返す", (x, y) => {
  expect(PathSegment.moveTo(x, y)).toEqual({ kind: "moveTo", x, y });
});

test.each([
  [0, 0],
  [100.5, -42],
])("PathSegment.lineTo(%s, %s) は lineTo segment を返す", (x, y) => {
  expect(PathSegment.lineTo(x, y)).toEqual({ kind: "lineTo", x, y });
});

test.each([
  [1, 2, 3, 4, 5, 6],
  [-10.5, 0, 0.25, -7, 100, 200],
])("PathSegment.curveTo(%s, %s, %s, %s, %s, %s) は 6 operand を保持する curveTo segment を返す", (x1, y1, x2, y2, x3, y3) => {
  expect(PathSegment.curveTo(x1, y1, x2, y2, x3, y3)).toEqual({
    kind: "curveTo",
    x1,
    y1,
    x2,
    y2,
    x3,
    y3,
  });
});

test("PathSegment.close は kind:close のみを持つ segment を返す", () => {
  expect(PathSegment.close()).toEqual({ kind: "close" });
});

test.each([
  [0, 0, 100, 50],
  [10, 20, -5, -7],
])("PathSegment.rect(%s, %s, %s, %s) は rect segment を返す", (x, y, width, height) => {
  expect(PathSegment.rect(x, y, width, height)).toEqual({
    kind: "rect",
    x,
    y,
    width,
    height,
  });
});

const moveToSample = PathSegment.moveTo(1, 2);
const lineToSample = PathSegment.lineTo(3, 4);
const curveToSample = PathSegment.curveTo(1, 2, 3, 4, 5, 6);
const closeSample = PathSegment.close();
const rectSample = PathSegment.rect(0, 0, 10, 20);

test.each([
  [moveToSample, true],
  [lineToSample, false],
  [curveToSample, false],
  [closeSample, false],
  [rectSample, false],
] as const)("PathSegment.isMoveTo(%j) は %s を返す", (segment, expected) => {
  expect(PathSegment.isMoveTo(segment)).toBe(expected);
});

test.each([
  [moveToSample, false],
  [lineToSample, true],
  [curveToSample, false],
  [closeSample, false],
  [rectSample, false],
] as const)("PathSegment.isLineTo(%j) は %s を返す", (segment, expected) => {
  expect(PathSegment.isLineTo(segment)).toBe(expected);
});

test.each([
  [moveToSample, false],
  [lineToSample, false],
  [curveToSample, true],
  [closeSample, false],
  [rectSample, false],
] as const)("PathSegment.isCurveTo(%j) は %s を返す", (segment, expected) => {
  expect(PathSegment.isCurveTo(segment)).toBe(expected);
});

test.each([
  [moveToSample, false],
  [lineToSample, false],
  [curveToSample, false],
  [closeSample, true],
  [rectSample, false],
] as const)("PathSegment.isClose(%j) は %s を返す", (segment, expected) => {
  expect(PathSegment.isClose(segment)).toBe(expected);
});

test.each([
  [moveToSample, false],
  [lineToSample, false],
  [curveToSample, false],
  [closeSample, false],
  [rectSample, true],
] as const)("PathSegment.isRect(%j) は %s を返す", (segment, expected) => {
  expect(PathSegment.isRect(segment)).toBe(expected);
});
