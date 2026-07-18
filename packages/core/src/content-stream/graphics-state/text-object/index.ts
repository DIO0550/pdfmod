import type { Brand } from "../../../utils/brand/index";
import { Matrix } from "../matrix";

declare const TextObjectBrand: unique symbol;

type TextObjectFields = {
  readonly active: boolean;
  readonly textMatrix: Matrix;
  readonly textLineMatrix: Matrix;
};

/**
 * PDF コンテンツストリームの `BT` 〜 `ET` で囲まれるテキストオブジェクト状態
 * (ISO 32000-1:2008 §9.4.1)。
 *
 * - `active` : `BT` 〜 `ET` の間で `true`、それ以外で `false`。
 * - `textMatrix`     : 現在のテキスト行列 (ISO 32000-1:2008 §9.4.2)。
 * - `textLineMatrix` : 現在のテキスト行の行列 (同 §9.4.2)。
 *
 * `Td` / `TD` / `Tm` / `T*` ハンドラが `translateLine` / `setMatrix` を通じて
 * matrix を更新する。
 */
export type TextObject = Brand<TextObjectFields, typeof TextObjectBrand>;

export const TextObject = {
  /**
   * 非アクティブな TextObject を返す。`BT` 未到達時の初期状態に相当する。
   * `active = false`、`textMatrix` / `textLineMatrix` は `Matrix.identity()`。
   *
   * @returns 非アクティブな TextObject
   */
  inactive(): TextObject {
    return {
      active: false,
      textMatrix: Matrix.identity(),
      textLineMatrix: Matrix.identity(),
    } as unknown as TextObject;
  },
  /**
   * `BT` operator (ISO 32000-1:2008 §9.4.1) でテキストオブジェクトを開始する。
   * `active = true` に切り替え、`textMatrix` / `textLineMatrix` を identity に初期化する。
   *
   * @returns アクティブな TextObject
   */
  begin(): TextObject {
    return {
      active: true,
      textMatrix: Matrix.identity(),
      textLineMatrix: Matrix.identity(),
    } as unknown as TextObject;
  },
  /**
   * `ET` operator (ISO 32000-1:2008 §9.4.1) でテキストオブジェクトを終了する。
   * `active = false` に戻し、両 matrix を identity に戻す。
   * 既に inactive な state に対しても冪等 (同値の inactive を返す)。
   *
   * `ET` は現在の matrix の値によらず無条件で inactive に戻る仕様のため、
   * `_state` は参照せず `inactive()` に委譲する。引数として `_state` を
   * 受け取るシグネチャは、companion object 内の他メソッドとの統一のために
   * 維持している。
   *
   * @param _state - 終了対象の TextObject (現在は読まない)
   * @returns 非アクティブな TextObject (`inactive()` と同値)
   */
  end(_state: TextObject): TextObject {
    return TextObject.inactive();
  },
  /**
   * `state.active` を読み出す predicate (アクセサ)。
   * 戻り値は `boolean` で、TypeScript の型ナローイングは行わない
   * (`active`/`inactive` の判別可能 union 型は未定義のため)。
   *
   * @param state - 判定対象の TextObject
   * @returns `state.active` が `true` なら `true`
   */
  isActive(state: TextObject): boolean {
    return state.active;
  },
  /**
   * `Td` / `TD` / `T*` operator (ISO 32000-1:2008 §9.4.2) の行送りに相当する
   * テキスト行行列の更新。`Tlm' = translate(tx, ty) × Tlm` を計算し、
   * `Tm'` も同値に設定する (`Tm' = Tlm'`)。
   *
   * `translate(tx, ty)` は `Matrix.create(1, 0, 0, 1, tx, ty)`。
   * 引数の向きは「左 = 適用する変換」(`cm` ハンドラと同一規約)。
   * `active` は引数 state から引き継ぐ。元 state は変更しない (純粋関数)。
   *
   * @param state - 更新対象の TextObject
   * @param tx - x 方向の平行移動量
   * @param ty - y 方向の平行移動量 (行送りは通常負値)
   * @returns `textMatrix` / `textLineMatrix` を更新した新しい TextObject
   */
  translateLine(state: TextObject, tx: number, ty: number): TextObject {
    const translation = Matrix.create(1, 0, 0, 1, tx, ty);
    const next = Matrix.multiply(translation, state.textLineMatrix);
    return {
      active: state.active,
      textMatrix: next,
      textLineMatrix: next,
    } as TextObject;
  },
  /**
   * `Tm` operator (ISO 32000-1:2008 §9.4.2) のテキスト行列上書き。
   * `Tm' = Tlm' = matrix` に設定する (両フィールドを引数 matrix と同値にする)。
   *
   * `active` は引数 state から引き継ぐ。元 state は変更しない (純粋関数)。
   * `Matrix` は readonly tuple として不変に扱う値であり、本コードベースでは
   * 生成後に破壊的変更しない運用のため、引数 matrix をそのまま両フィールドへ
   * 代入してよい (防御コピー不要)。
   *
   * @param state - 更新対象の TextObject
   * @param matrix - 新しい textMatrix / textLineMatrix
   * @returns `textMatrix` / `textLineMatrix` を matrix に置き換えた新しい TextObject
   */
  setMatrix(state: TextObject, matrix: Matrix): TextObject {
    return {
      active: state.active,
      textMatrix: matrix,
      textLineMatrix: matrix,
    } as TextObject;
  },
  /**
   * `TJ` の数値要素による位置調整 (ISO 32000-1:2008 §9.4.3)
   * や将来のグリフ送り (advance) の基盤となる、テキスト行列のみの平行移動。
   * `Tm' = translate(tx, ty) × Tm` を計算する (ISO 32000-1:2008 §9.4.2 の
   * テキスト行列更新)。`textLineMatrix` (行頭) は据え置く点が `translateLine`
   * との差分。
   *
   * `translate(tx, ty)` は `Matrix.create(1, 0, 0, 1, tx, ty)`。
   * 引数の向きは「左 = 適用する変換」(`cm` / `translateLine` ハンドラと同一規約)。
   * `active` は引数 state から引き継ぐ。元 state は変更しない (純粋関数)。
   * `Matrix` は readonly tuple であり、本コードベースでは生成後に破壊的変更しない
   * 運用のため `state.textLineMatrix` をそのまま据え置いてよい (防御コピー不要)。
   *
   * @param state - 更新対象の TextObject
   * @param tx - x 方向の平行移動量
   * @param ty - y 方向の平行移動量
   * @returns `textMatrix` のみを更新し `textLineMatrix` を据え置いた新しい TextObject
   */
  translateText(state: TextObject, tx: number, ty: number): TextObject {
    const translation = Matrix.create(1, 0, 0, 1, tx, ty);
    const next = Matrix.multiply(translation, state.textMatrix);
    return {
      active: state.active,
      textMatrix: next,
      textLineMatrix: state.textLineMatrix,
    } as TextObject;
  },
} as const;
