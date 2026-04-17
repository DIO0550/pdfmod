import type { Result } from "../../utils/result/index";
import { err, ok } from "../../utils/result/index";
import type { Brand } from "../brand/index";

declare const ObjectNumberBrand: unique symbol;

type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

const ObjectNumber = {
  create(n: number): Result<ObjectNumber, string> {
    if (!Number.isSafeInteger(n) || n < 0) {
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
