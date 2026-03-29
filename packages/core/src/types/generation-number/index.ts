import type { Result } from "../../result/index";
import { err, ok } from "../../result/index";
import type { Brand } from "../brand/index";

declare const GenerationNumberBrand: unique symbol;

const MAX_GENERATION_NUMBER = 65535;

type GenerationNumber = Brand<number, typeof GenerationNumberBrand>;

const GenerationNumber = {
  create(n: number): Result<GenerationNumber, string> {
    if (!Number.isInteger(n) || n < 0 || n > MAX_GENERATION_NUMBER) {
      return err(
        `Invalid GenerationNumber: ${n} (must be an integer in range 0-${MAX_GENERATION_NUMBER})`,
      );
    }
    return ok(n as GenerationNumber);
  },

  of(n: number): GenerationNumber {
    return n as GenerationNumber;
  },
} as const;

export { GenerationNumber };
