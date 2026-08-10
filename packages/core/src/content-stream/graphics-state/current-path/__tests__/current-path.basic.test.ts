import { assert, expect, test } from "vitest";
import { CurrentPath } from "../../current-path";
import { PathSegment } from "../../path-segment";

test("CurrentPath.empty() の segments は空配列", () => {
  expect(CurrentPath.empty().segments).toEqual([]);
});

test("CurrentPath.isEmpty(CurrentPath.empty()) は true を返す", () => {
  expect(CurrentPath.isEmpty(CurrentPath.empty())).toBe(true);
});

test("CurrentPath.append(empty, moveTo(1,2)) の segments は [moveTo(1,2)]", () => {
  const next = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  expect(next.segments).toEqual([{ kind: "moveTo", x: 1, y: 2 }]);
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
  expect(prev.segments).toEqual([]);
});

test("CurrentPath.append の next.segments は prev.segments と別配列参照", () => {
  const prev = CurrentPath.empty();
  const next = CurrentPath.append(prev, PathSegment.moveTo(1, 2));
  expect(next.segments).not.toBe(prev.segments);
});

test("CurrentPath.isEmpty(append(empty, seg)) は false を返す", () => {
  const next = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  expect(CurrentPath.isEmpty(next)).toBe(false);
});

test("moveTo 済み path に closeSubpath を適用すると close segment が付く", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(0, 0),
  );

  const closed = CurrentPath.closeSubpath(path);

  expect(closed.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
  ]);
});

test("moveTo → lineTo 済み path に closeSubpath を適用できる", () => {
  const path = CurrentPath.append(
    CurrentPath.append(CurrentPath.empty(), PathSegment.moveTo(0, 0)),
    PathSegment.lineTo(10, 10),
  );
  const closed = CurrentPath.closeSubpath(path);

  expect(closed.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(10, 10),
    PathSegment.close(),
  ]);
});
test("rect 済み path に closeSubpath を適用できる", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.rect(10, 10, 100, 50),
  );
  const closed = CurrentPath.closeSubpath(path);

  expect(closed.segments).toEqual([
    PathSegment.rect(10, 10, 100, 50),
    PathSegment.close(),
  ]);
});

test("closeSubpath を適用しても元の path は mutate されない", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(0, 0),
  );
  const beforeSegments = path.segments;
  const closed = CurrentPath.closeSubpath(path);

  expect(path.segments).toEqual([PathSegment.moveTo(0, 0)]);
  expect(closed.segments).not.toBe(beforeSegments);
});

test("空 path に closeSubpath を適用しても close は追加されない", () => {
  const path = CurrentPath.empty();
  const closed = CurrentPath.closeSubpath(path);

  expect(closed).toBe(path);
  expect(closed.segments).toEqual([]);
  expect(CurrentPath.isEmpty(closed)).toBe(true);
});
test("closeSubpath を連続適用すると close segment が 2 つ並ぶ", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(0, 0),
  );
  const firstClosed = CurrentPath.closeSubpath(path);
  const secondClosed = CurrentPath.closeSubpath(firstClosed);

  expect(secondClosed.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
    PathSegment.close(),
  ]);
});
test("closeSubpath 後も lastPoint は subpath 開始点を返す", () => {
  const path = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.rect(10, 10, 100, 50),
  );
  const closed = CurrentPath.closeSubpath(path);
  const lastPoint = CurrentPath.lastPoint(closed);

  assert(lastPoint.some);
  expect(lastPoint.value).toEqual({ x: 10, y: 10 });
});
test("連続 append は順序を保持する", () => {
  const moveTo = PathSegment.moveTo(1, 2);
  const lineTo = PathSegment.lineTo(3, 4);
  const close = PathSegment.close();
  const final = CurrentPath.append(
    CurrentPath.append(CurrentPath.append(CurrentPath.empty(), moveTo), lineTo),
    close,
  );
  expect(final.segments).toEqual([moveTo, lineTo, close]);
});

test("CurrentPath.beginSubpath(empty, moveTo) の segments は [moveTo]", () => {
  const next = CurrentPath.beginSubpath(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  expect(next.segments).toEqual([PathSegment.moveTo(1, 2)]);
});

test("末尾が non-moveTo (lineTo) のとき beginSubpath は末尾に append する", () => {
  const prev = CurrentPath.append(
    CurrentPath.append(CurrentPath.empty(), PathSegment.moveTo(1, 2)),
    PathSegment.lineTo(3, 4),
  );
  const next = CurrentPath.beginSubpath(prev, PathSegment.moveTo(5, 6));
  expect(next.segments).toEqual([
    PathSegment.moveTo(1, 2),
    PathSegment.lineTo(3, 4),
    PathSegment.moveTo(5, 6),
  ]);
});

test("末尾が moveTo のとき beginSubpath は前の moveTo を上書きする (§8.5.2)", () => {
  const prev = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  const next = CurrentPath.beginSubpath(prev, PathSegment.moveTo(5, 6));
  expect(next.segments).toEqual([PathSegment.moveTo(5, 6)]);
});

test("末尾が moveTo のとき beginSubpath は手前の segment を保持する", () => {
  const prev = CurrentPath.append(
    CurrentPath.append(
      CurrentPath.append(CurrentPath.empty(), PathSegment.moveTo(1, 2)),
      PathSegment.lineTo(3, 4),
    ),
    PathSegment.moveTo(10, 20),
  );
  const next = CurrentPath.beginSubpath(prev, PathSegment.moveTo(30, 40));
  expect(next.segments).toEqual([
    PathSegment.moveTo(1, 2),
    PathSegment.lineTo(3, 4),
    PathSegment.moveTo(30, 40),
  ]);
});

test("CurrentPath.beginSubpath 後も元 path は不変", () => {
  const prev = CurrentPath.append(
    CurrentPath.empty(),
    PathSegment.moveTo(1, 2),
  );
  const beforeSegments = prev.segments;
  CurrentPath.beginSubpath(prev, PathSegment.moveTo(5, 6));
  expect(beforeSegments).toEqual([PathSegment.moveTo(1, 2)]);
});
