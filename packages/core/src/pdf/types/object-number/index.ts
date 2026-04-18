import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const ObjectNumberBrand: unique symbol;

type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

const ObjectNumber = {
  create(n: number): Result<ObjectNumber, string> {
    if (!NumberEx.isSafeIntegerAtLeastZero(n)) {
      return err(
        `Invalid ObjectNumber: ${n} (must be a non-negative safe integer)`,
      );
    }
    return ok(n as ObjectNumber);
  },

  of(n: number): ObjectNumber {
    return n as ObjectNumber;
  },
} as const;

export { ObjectNumber };
