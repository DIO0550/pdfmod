import { assert, expect, test } from "vitest";
import {
  CurrentPath,
  type CurrentPath as CurrentPathType,
} from "../../current-path";
import { PathSegment } from "../../path-segment";

const appendSegments = (
  segments: ReadonlyArray<PathSegment>,
): CurrentPathType => {
  let path = CurrentPath.empty();
  for (const segment of segments) {
    path = CurrentPath.append(path, segment);
  }
  return path;
};

test("空 path の lastPoint は none を返す", () => {
  expect(CurrentPath.lastPoint(CurrentPath.empty())).toEqual({ some: false });
});

test("末尾 moveTo の座標を current point として返す", () => {
  const path = appendSegments([PathSegment.moveTo(100, 200)]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 100, y: 200 });
});

test("末尾 lineTo の終点を current point として返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(100, 200),
    PathSegment.lineTo(300, 400),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 300, y: 400 });
});

test("末尾 curveTo の終点を current point として返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(100, 200),
    PathSegment.curveTo(300, 400, 500, 600, 700, 800),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 700, y: 800 });
});

test("末尾 rect の左下座標を current point として返す", () => {
  const path = appendSegments([PathSegment.rect(10, 20, 100, 50)]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 10, y: 20 });
});

test("末尾 close は直近の moveTo の座標を current point として返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
    PathSegment.close(),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 100, y: 100 });
});

test("末尾 close は rect の座標を subpath 開始点として返す", () => {
  const path = appendSegments([
    PathSegment.rect(10, 10, 100, 50),
    PathSegment.close(),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 10, y: 10 });
});

test("複数 subpath の末尾 close は最後の subpath 開始点を返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(10, 10),
    PathSegment.lineTo(20, 20),
    PathSegment.close(),
    PathSegment.moveTo(50, 50),
    PathSegment.lineTo(60, 60),
    PathSegment.close(),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 50, y: 50 });
});

test("連続する close は同じ subpath 開始点を返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
    PathSegment.close(),
    PathSegment.close(),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 100, y: 100 });
});

test("close の後方走査は直近の rect を subpath 起点として扱う", () => {
  const path = appendSegments([
    PathSegment.moveTo(10, 10),
    PathSegment.lineTo(20, 20),
    PathSegment.close(),
    PathSegment.rect(30, 30, 40, 40),
    PathSegment.close(),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value).toEqual({ x: 30, y: 30 });
});

test("開始 segment のない close は none を返す", () => {
  const path = appendSegments([PathSegment.close()]);

  expect(CurrentPath.lastPoint(path)).toEqual({ some: false });
});

test("座標の NaN と Infinity は検証せずそのまま返す", () => {
  const path = appendSegments([
    PathSegment.moveTo(Number.NaN, Number.POSITIVE_INFINITY),
  ]);

  const result = CurrentPath.lastPoint(path);

  assert(result.some);
  expect(result.value.x).toBeNaN();
  expect(result.value.y).toBe(Number.POSITIVE_INFINITY);
});

test("lastPoint 呼び出し後も segments の参照と内容は不変", () => {
  const path = appendSegments([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.close(),
  ]);
  const beforeSegments = path.segments;

  CurrentPath.lastPoint(path);

  expect(path.segments).toBe(beforeSegments);
  expect(path.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.close(),
  ]);
});
