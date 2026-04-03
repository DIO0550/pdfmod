import { NumberEx } from "../number-ex/index";
import type { Option } from "../option/index";
import { none, some } from "../option/index";

const DECIMAL_INTEGER = /^\+?[0-9]+$/;

export const StringEx = {
  toSafeIntegerAtLeastZero: (s: string): Option<number> => {
    if (!DECIMAL_INTEGER.test(s)) {
      return none;
    }
    const n = Number(s);
    return NumberEx.isSafeIntegerAtLeastZero(n) ? some(n) : none;
  },
} as const;
