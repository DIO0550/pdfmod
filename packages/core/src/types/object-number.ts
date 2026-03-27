import type { Result } from "../result/index";
import { err, ok } from "../result/index";
import type { Brand } from "./brand";

declare const ObjectNumberBrand: unique symbol;

type ObjectNumber = Brand<number, typeof ObjectNumberBrand>;

const ObjectNumber = {
  create(n: number): Result<ObjectNumber, string> {
    if (!Number.isInteger(n) || n < 0) {
      return err(`Invalid ObjectNumber: ${n} (must be a non-negative integer)`);
    }
    return ok(n as ObjectNumber);
  },

  of(n: number): ObjectNumber {
    return n as ObjectNumber;
  },
} as const;

export { ObjectNumber };
