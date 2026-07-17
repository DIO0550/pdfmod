/**
 * `m` operator (moveto) が生成する segment。新しいサブパスを現在点として開始する。
 */
export type MoveToSegment = {
  readonly kind: "moveTo";
  readonly x: number;
  readonly y: number;
};

/**
 * `l` operator (lineto) が生成する segment。現在点から直線を追加する。
 */
export type LineToSegment = {
  readonly kind: "lineTo";
  readonly x: number;
  readonly y: number;
};

/**
 * `c` operator (curveto) が生成する segment。2 つの制御点を持つ 3 次 Bezier 曲線を追加する。
 */
export type CurveToSegment = {
  readonly kind: "curveTo";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly x3: number;
  readonly y3: number;
};

/**
 * `h` operator (closepath) が生成する segment。現在のサブパスを開始点へ直線で閉じる。
 */
export type CloseSegment = {
  readonly kind: "close";
};

/**
 * `re` operator (rectangle) が生成する segment。矩形の独立したサブパスを追加する。
 */
export type RectSegment = {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * PDF spec §4.1 path construction operator が生成する 1 segment。
 * discriminated union + companion object (factory + is*).
 */
export type PathSegment =
  | MoveToSegment
  | LineToSegment
  | CurveToSegment
  | CloseSegment
  | RectSegment;

export const PathSegment = {
  /**
   * `m` operator が生成する MoveTo segment を作成する。
   *
   * @param x - 開始点 X 座標 (PDF ユーザー空間)
   * @param y - 開始点 Y 座標 (PDF ユーザー空間)
   * @returns MoveToSegment
   */
  moveTo(x: number, y: number): MoveToSegment {
    return { kind: "moveTo", x, y };
  },
  /**
   * `l` operator が生成する LineTo segment を作成する。
   *
   * @param x - 終点 X 座標 (PDF ユーザー空間)
   * @param y - 終点 Y 座標 (PDF ユーザー空間)
   * @returns LineToSegment
   */
  lineTo(x: number, y: number): LineToSegment {
    return { kind: "lineTo", x, y };
  },
  /**
   * `c` operator が生成する CurveTo (3 次 Bezier) segment を作成する。
   *
   * @param x1 - 第 1 制御点 X
   * @param y1 - 第 1 制御点 Y
   * @param x2 - 第 2 制御点 X
   * @param y2 - 第 2 制御点 Y
   * @param x3 - 終点 X
   * @param y3 - 終点 Y
   * @returns CurveToSegment
   */
  curveTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ): CurveToSegment {
    return { kind: "curveTo", x1, y1, x2, y2, x3, y3 };
  },
  /**
   * `h` operator が生成する Close segment を作成する。
   *
   * @returns CloseSegment
   */
  close(): CloseSegment {
    return { kind: "close" };
  },
  /**
   * `re` operator が生成する Rectangle segment を作成する。
   *
   * @param x - 左下 X
   * @param y - 左下 Y
   * @param width - 幅
   * @param height - 高さ
   * @returns RectSegment
   */
  rect(x: number, y: number, width: number, height: number): RectSegment {
    return { kind: "rect", x, y, width, height };
  },
  /**
   * MoveTo segment かを判定する型ガード。
   */
  isMoveTo(value: PathSegment): value is MoveToSegment {
    return value.kind === "moveTo";
  },
  /**
   * LineTo segment かを判定する型ガード。
   */
  isLineTo(value: PathSegment): value is LineToSegment {
    return value.kind === "lineTo";
  },
  /**
   * CurveTo segment かを判定する型ガード。
   */
  isCurveTo(value: PathSegment): value is CurveToSegment {
    return value.kind === "curveTo";
  },
  /**
   * Close segment かを判定する型ガード。
   */
  isClose(value: PathSegment): value is CloseSegment {
    return value.kind === "close";
  },
  /**
   * Rect segment かを判定する型ガード。
   */
  isRect(value: PathSegment): value is RectSegment {
    return value.kind === "rect";
  },
} as const;
