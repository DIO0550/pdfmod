import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import { none, type Option, some } from "../../../utils/option/index";
import { type MoveToSegment, PathSegment } from "../path-segment";

declare const CurrentPathBrand: unique symbol;

type CurrentPathFields = {
  readonly segments: ReadonlyArray<PathSegment>;
};

/**
 * PDF content stream の path construction operator (`m` / `l` / `c` / `re` / `h`) が
 * 逐次生成する {@link PathSegment} を不変に保持するコンテナ。
 * append は元 path を変更せず、新しい `CurrentPath` を返す。
 */
export type CurrentPath = Brand<CurrentPathFields, typeof CurrentPathBrand>;

/**
 * `close` segment の直前まで後方走査し、その subpath を開始した
 * `moveTo` / `rect` の座標を返す。
 *
 * @param segments - 走査対象の segment 列
 * @param closeIndex - 起点となる `close` segment の index
 * @returns subpath 開始点。開始 segment が見つからなければ `none`
 */
const subpathStartPoint = (
  segments: ReadonlyArray<PathSegment>,
  closeIndex: number,
): Option<{ x: number; y: number }> => {
  for (let i = closeIndex - 1; i >= 0; i--) {
    const segment = segments[i];
    if (PathSegment.isMoveTo(segment) || PathSegment.isRect(segment)) {
      return some({ x: segment.x, y: segment.y });
    }
  }
  return none;
};

export const CurrentPath = {
  /**
   * 空の `CurrentPath` を返す。
   * 参照同一性 (singleton かどうか) は API 契約にしない。
   * 呼び出し側は `toEqual` で構造比較すること (`toBe` / `not.toBe` を assert しない)。
   *
   * @returns segments が空の `CurrentPath`
   */
  empty(): CurrentPath {
    return { segments: [] } as unknown as CurrentPath;
  },
  /**
   * `path` に `segment` を追加した新しい `CurrentPath` を返す。
   * 元 `path` は変更せず、内部 `segments` 配列も新規生成する
   * (`[...path.segments, segment]` で別配列参照)。
   *
   * @param path - 元の `CurrentPath` (変更されない)
   * @param segment - 末尾に追加する {@link PathSegment}
   * @returns segment を追加した新規 `CurrentPath`
   */
  append(path: CurrentPath, segment: PathSegment): CurrentPath {
    return { segments: [...path.segments, segment] } as unknown as CurrentPath;
  },
  /**
   * `path.segments` が空かを判定する。
   *
   * @param path - 判定対象
   * @returns 空なら `true`
   */
  isEmpty(path: CurrentPath): boolean {
    return path.segments.length === 0;
  },
  /**
   * current point (末尾 segment の終点) を返す。
   *
   * `close` の場合は直近の subpath 開始 segment (`moveTo` / `rect`) まで遡る。
   *
   * @param path - 対象の `CurrentPath`
   * @returns current point。未確立なら `none`
   */
  lastPoint(path: CurrentPath): Option<{ x: number; y: number }> {
    const segments = path.segments;
    const lastIndex = segments.length - 1;
    if (!NumberEx.isSafeIntegerAtLeastZero(lastIndex)) {
      return none;
    }
    const last = segments[lastIndex];
    switch (last.kind) {
      case "moveTo":
      case "lineTo":
      case "rect":
        return some({ x: last.x, y: last.y });
      case "curveTo":
        return some({ x: last.x3, y: last.y3 });
      case "close":
        return subpathStartPoint(segments, lastIndex);
      default: {
        const unreachable: never = last;
        return unreachable;
      }
    }
  },
  /**
   * `m` operator (ISO 32000-1:2008 §8.5.2) で新しい subpath を開始する。
   * 直前 segment が `moveTo` の場合は連続 `m` とみなし、前の `moveTo` を
   * 残さず新しい `moveTo` で上書きする。それ以外は末尾に append する。
   *
   * @param path - 元の `CurrentPath` (変更されない)
   * @param moveTo - 新しい subpath の起点 `MoveToSegment`
   * @returns 上書き / append された新規 `CurrentPath`
   */
  beginSubpath(path: CurrentPath, moveTo: MoveToSegment): CurrentPath {
    const segments = path.segments;
    const lastIndex = segments.length - 1;
    if (
      NumberEx.isSafeIntegerAtLeastZero(lastIndex) &&
      segments[lastIndex].kind === "moveTo"
    ) {
      return {
        segments: [...segments.slice(0, lastIndex), moveTo],
      } as unknown as CurrentPath;
    }
    return {
      segments: [...segments, moveTo],
    } as unknown as CurrentPath;
  },
} as const;
