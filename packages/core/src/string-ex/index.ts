import { NumberEx } from "../number-ex/index";

const DECIMAL_INTEGER = /^[0-9]+$/;

export const StringEx = {
  toSafeIntegerAtLeastZero: (s: string): number | undefined => {
    if (!DECIMAL_INTEGER.test(s)) {
      return undefined;
    }
    const n = Number(s);
    return NumberEx.isSafeIntegerAtLeastZero(n) ? n : undefined;
  },
} as const;
