/** MD5 と SHA-256 が使う 32 ビットワードの循環シフト。 */
const WORD_BITS = 32;

type Rotation = {
  readonly word: number;
  readonly bits: number;
};

export const Word32 = {
  rotateLeft({ word, bits }: Rotation): number {
    return (word << bits) | (word >>> (WORD_BITS - bits));
  },

  rotateRight({ word, bits }: Rotation): number {
    return (word >>> bits) | (word << (WORD_BITS - bits));
  },
} as const;
