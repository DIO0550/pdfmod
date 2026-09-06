import { NumberEx } from "../../../ext/number/index";
import { none, type Option, some } from "../../../utils/option/index";
import { GenerationNumber } from "../generation-number/index";
import { ObjectNumber } from "../object-number/index";
import type { PdfIndirectRef } from "../pdf-types/index";

/**
 * PDF間接オブジェクト参照 (例: "5 0 R")。
 * オブジェクト番号と世代番号の組でオブジェクトを参照する。
 *
 * @example
 * ```ts
 * const ref: IndirectRef = { objectNumber: ObjectNumber.of(5), generationNumber: GenerationNumber.of(0) };
 * ```
 */
interface IndirectRef {
  /** オブジェクト番号 */
  objectNumber: ObjectNumber;
  /** 世代番号 */
  generationNumber: GenerationNumber;
}

/**
 * `IndirectRef` の factory / 検証 utility を束ねた namespace。
 */
const IndirectRef = {
  /**
   * 生 PdfIndirectRef を検証し、ブランド付き IndirectRef を Some で返す。
   *
   * @param raw - 生 indirect-ref
   * @returns Some(IndirectRef) または None
   */
  from(raw: PdfIndirectRef): Option<IndirectRef> {
    if (!NumberEx.isSafeIntegerAtLeastZero(raw.generationNumber)) {
      return none;
    }
    const gen = GenerationNumber.create(raw.generationNumber);
    if (!gen.ok) {
      return none;
    }
    // オブジェクト番号の検証基準は ObjectNumber.create に集約している（#334 / D-7）。
    const objNum = ObjectNumber.create(raw.objectNumber);
    if (!objNum.ok) {
      return none;
    }
    return some({
      objectNumber: objNum.value,
      generationNumber: gen.value,
    });
  },
} as const;

export { IndirectRef };
