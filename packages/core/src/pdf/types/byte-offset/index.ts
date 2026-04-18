import { NumberEx } from "../../../ext/number/index";
import type { Brand } from "../../../utils/brand/index";
import type { Result } from "../../../utils/result/index";
import { err, ok } from "../../../utils/result/index";

declare const ByteOffsetBrand: unique symbol;

type ByteOffset = Brand<number, typeof ByteOffsetBrand>;

const ByteOffset = {
  create(n: number): Result<ByteOffset, string> {
    if (!NumberEx.isSafeIntegerAtLeastZero(n)) {
      return err(
        `Invalid ByteOffset: ${n} (must be a non-negative safe integer)`,
      );
    }
    return ok(n as ByteOffset);
  },

  of(n: number): ByteOffset {
    return n as ByteOffset;
  },

  add(a: ByteOffset, b: ByteOffset): ByteOffset {
    return ((a as number) + (b as number)) as ByteOffset;
  },
} as const;

export { ByteOffset };
