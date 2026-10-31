import { KeyLengths } from "../../key-length/index";

/** /V 1 /R 3 のRC4。 */
export type V1R3 = {
  readonly kind: "V1R3";
  readonly keyLength: typeof KeyLengths.Bits40;
};

export const V1R3 = {
  /**
   * 固定鍵長の方式を生成する。
   * @returns 40ビットのRC4。
   */
  create(): V1R3 {
    return { kind: "V1R3", keyLength: KeyLengths.Bits40 };
  },
} as const;
