import { KeyLengths } from "../../key-length/index";

/** /V 1 /R 2 のRC4。 */
export type V1R2 = {
  readonly kind: "V1R2";
  readonly keyLength: typeof KeyLengths.Bits40;
};

export const V1R2 = {
  /**
   * 固定鍵長の方式を生成する。
   * @returns 40ビットのRC4。
   */
  create(): V1R2 {
    return { kind: "V1R2", keyLength: KeyLengths.Bits40 };
  },
} as const;
