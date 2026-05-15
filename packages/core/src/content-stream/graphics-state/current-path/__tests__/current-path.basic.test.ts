import { expect, test } from "vitest";
import { CurrentPath } from "../../current-path";
import { PathSegment } from "../../path-segment";

test("CurrentPath.segments(CurrentPath.empty()) は空配列を返す", () => {
  expect(CurrentPath.segments(CurrentPath.empty())).toEqual([]);
});

test("CurrentPath.isEmpty(CurrentPath.empty()) は true を返す", () => {
  expect(CurrentPath.isEmpty(CurrentPath.empty())).toBe(true);
});

test("CurrentPath.append(empty, moveTo(1,2)) の segments は [moveTo(1,2)]", () => {
  const next = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  expect(CurrentPath.segments(next)).toEqual([{ kind: "moveTo", x: 1, y: 2 }]);
});

test("CurrentPath.append の戻り値は元 path と別参照", () => {
  const prev = CurrentPath.empty();
  const next = CurrentPath.append(prev, PathSegment.moveTo(1, 2));
  expect(next).not.toBe(prev);
});

test("CurrentPath.append 後も元 path は empty のまま", () => {
  const prev = CurrentPath.empty();
  CurrentPath.append(prev, PathSegment.moveTo(1, 2));
  expect(CurrentPath.isEmpty(prev)).toBe(true);
  expect(CurrentPath.segments(prev)).toEqual([]);
});

test("CurrentPath.append の next.segments は prev.segments と別配列参照", () => {
  const prev = CurrentPath.empty();
  const next = CurrentPath.append(prev, PathSegment.moveTo(1, 2));
  expect(CurrentPath.segments(next)).not.toBe(CurrentPath.segments(prev));
});

test("CurrentPath.isEmpty(append(empty, seg)) は false を返す", () => {
  const next = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  expect(CurrentPath.isEmpty(next)).toBe(false);
});

test("連続 append は順序を保持し、segments で全件取得できる", () => {
  const moveTo = PathSegment.moveTo(1, 2);
  const lineTo = PathSegment.lineTo(3, 4);
  const close = PathSegment.close();
  const final = CurrentPath.append(
    CurrentPath.append(CurrentPath.append(CurrentPath.empty(), moveTo), lineTo),
    close,
  );
  expect(CurrentPath.segments(final)).toEqual([moveTo, lineTo, close]);
});
