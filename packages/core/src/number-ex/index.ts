export const NumberEx = {
  isPositiveSafeInteger: (n: number): boolean =>
    Number.isSafeInteger(n) && n > 0,

  isSafeIntegerAtLeastZero: (n: number): boolean =>
    Number.isSafeInteger(n) && n >= 0,
} as const;
