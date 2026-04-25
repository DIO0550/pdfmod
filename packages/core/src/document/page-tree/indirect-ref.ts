import { NumberEx } from "../../ext/number/index";
import { GenerationNumber } from "../../pdf/types/generation-number/index";
import { ObjectNumber } from "../../pdf/types/object-number/index";
import type {
  IndirectRef as IndirectRefType,
  PdfIndirectRef,
} from "../../pdf/types/pdf-types/index";
import { none, type Option, some } from "../../utils/option/index";

type IndirectRef = IndirectRefType;

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
    if (!NumberEx.isPositiveSafeInteger(raw.objectNumber)) {
      return none;
    }
    if (!NumberEx.isSafeIntegerAtLeastZero(raw.generationNumber)) {
      return none;
    }
    const gen = GenerationNumber.create(raw.generationNumber);
    if (!gen.ok) {
      return none;
    }
    return some({
      objectNumber: ObjectNumber.of(raw.objectNumber),
      generationNumber: gen.value,
    });
  },
} as const;

export { IndirectRef };
