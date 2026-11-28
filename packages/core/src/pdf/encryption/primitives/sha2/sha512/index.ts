import type { ValueOf } from "../../../../../utils/types/utility-type";
import { HashBlockLayouts, visitHashBlocks } from "../../hash-blocks/index";
import { readHexWords } from "../../hex-words/index";

const WORD_BYTES = 8;
const WORD_BITS = 64;
const WORD_BITS_BIGINT = BigInt(WORD_BITS);
const SCHEDULE_SIGMA0_SHIFT = 7n;
const SCHEDULE_SIGMA1_SHIFT = 6n;
const SCHEDULE_PRIOR_WORD_OFFSET = 7;
const MESSAGE_WORDS = HashBlockLayouts.Sha512.blockBytes / WORD_BYTES;

const SHA384_INITIAL_STATE = /* @__PURE__ */ readHexWords(
  `
  cbbb9d5dc1059ed8 629a292a367cd507 9159015a3070dd17 152fecd8f70e5939
  67332667ffc00b31 8eb44a8768581511 db0c2e0d64f98fa7 47b5481dbefa4fa4
`,
  BigInt,
);

const SHA512_INITIAL_STATE = /* @__PURE__ */ readHexWords(
  `
  6a09e667f3bcc908 bb67ae8584caa73b 3c6ef372fe94f82b a54ff53a5f1d36f1
  510e527fade682d1 9b05688c2b3e6c1f 1f83d9abfb41bd6b 5be0cd19137e2179
`,
  BigInt,
);

const ROUND_CONSTANTS = /* @__PURE__ */ readHexWords(
  `
  428a2f98d728ae22 7137449123ef65cd b5c0fbcfec4d3b2f e9b5dba58189dbbc
  3956c25bf348b538 59f111f1b605d019 923f82a4af194f9b ab1c5ed5da6d8118
  d807aa98a3030242 12835b0145706fbe 243185be4ee4b28c 550c7dc3d5ffb4e2
  72be5d74f27b896f 80deb1fe3b1696b1 9bdc06a725c71235 c19bf174cf692694
  e49b69c19ef14ad2 efbe4786384f25e3 0fc19dc68b8cd5b5 240ca1cc77ac9c65
  2de92c6f592b0275 4a7484aa6ea6e483 5cb0a9dcbd41fbd4 76f988da831153b5
  983e5152ee66dfab a831c66d2db43210 b00327c898fb213f bf597fc7beef0ee4
  c6e00bf33da88fc2 d5a79147930aa725 06ca6351e003826f 142929670a0e6e70
  27b70a8546d22ffc 2e1b21385c26c926 4d2c6dfc5ac42aed 53380d139d95b3df
  650a73548baf63de 766a0abb3c77b2a8 81c2c92e47edaee6 92722c851482353b
  a2bfe8a14cf10364 a81a664bbc423001 c24b8b70d0f89791 c76c51a30654be30
  d192e819d6ef5218 d69906245565a910 f40e35855771202a 106aa07032bbd1b8
  19a4c116b8d2d0c8 1e376c085141ab53 2748774cdf8eeb99 34b0bcb5e19b48a8
  391c0cb3c5c95a63 4ed8aa4ae3418acb 5b9cca4f7763e373 682e6ff3d6b2b8a3
  748f82ee5defb2fc 78a5636f43172f60 84c87814a1f0ab72 8cc702081a6439ec
  90befffa23631e28 a4506cebde82bde9 bef9a3f7b2c67915 c67178f2e372532b
  ca273eceea26619c d186b8c721c0c207 eada7dd6cde0eb1e f57d4f7fee6ed178
  06f067aa72176fba 0a637dc5a2c898a6 113f9804bef90dae 1b710b35131c471b
  28db77f523047d84 32caab7b40c72493 3c9ebe0a15c9bebc 431d67c49c100d4c
  4cc5d4becb3e42b6 597f299cfc657e2a 5fcb6fab3ad6faec 6c44198c4a475817
`,
  BigInt,
);

type Rotation = {
  readonly word: bigint;
  readonly bits: bigint;
};

function rotateRight({ word, bits }: Rotation): bigint {
  return (
    (word >> bits) |
    BigInt.asUintN(WORD_BITS, word << (WORD_BITS_BIGINT - bits))
  );
}

function scheduleSigma0(word: bigint): bigint {
  return (
    rotateRight({ word, bits: 1n }) ^
    rotateRight({ word, bits: 8n }) ^
    (word >> SCHEDULE_SIGMA0_SHIFT)
  );
}

function scheduleSigma1(word: bigint): bigint {
  return (
    rotateRight({ word, bits: 19n }) ^
    rotateRight({ word, bits: 61n }) ^
    (word >> SCHEDULE_SIGMA1_SHIFT)
  );
}

function roundSigma0(word: bigint): bigint {
  return (
    rotateRight({ word, bits: 28n }) ^
    rotateRight({ word, bits: 34n }) ^
    rotateRight({ word, bits: 39n })
  );
}

function roundSigma1(word: bigint): bigint {
  return (
    rotateRight({ word, bits: 14n }) ^
    rotateRight({ word, bits: 18n }) ^
    rotateRight({ word, bits: 41n })
  );
}

const OUTPUT_WORDS = { Sha384: 6, Sha512: 8 } as const;

type Sha512Variant = {
  readonly initialState: readonly bigint[];
  readonly outputWords: ValueOf<typeof OUTPUT_WORDS>;
};

const SHA384: Sha512Variant = {
  initialState: SHA384_INITIAL_STATE,
  outputWords: OUTPUT_WORDS.Sha384,
};
const SHA512: Sha512Variant = {
  initialState: SHA512_INITIAL_STATE,
  outputWords: OUTPUT_WORDS.Sha512,
};

function digestSha512Family(
  input: Uint8Array,
  variant: Sha512Variant,
): Uint8Array {
  const state = BigUint64Array.from(variant.initialState);
  const schedule = new BigUint64Array(ROUND_CONSTANTS.length);

  visitHashBlocks(input, HashBlockLayouts.Sha512, (view, offset) => {
    for (let i = 0; i < MESSAGE_WORDS; i++) {
      schedule[i] = view.getBigUint64(offset + i * WORD_BYTES);
    }

    for (let i = MESSAGE_WORDS; i < schedule.length; i++) {
      schedule[i] =
        schedule[i - MESSAGE_WORDS] +
        scheduleSigma0(schedule[i - MESSAGE_WORDS + 1]) +
        schedule[i - SCHEDULE_PRIOR_WORD_OFFSET] +
        scheduleSigma1(schedule[i - 2]);
    }

    let [a, b, c, d, e, f, g, h] = state;

    for (let i = 0; i < schedule.length; i++) {
      const choice = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t1 = h + roundSigma1(e) + choice + ROUND_CONSTANTS[i] + schedule[i];
      const t2 = roundSigma0(a) + majority;

      h = g;
      g = f;
      f = e;
      e = BigInt.asUintN(WORD_BITS, d + t1);
      d = c;
      c = b;
      b = a;
      a = BigInt.asUintN(WORD_BITS, t1 + t2);
    }

    for (const [index, word] of [a, b, c, d, e, f, g, h].entries()) {
      state[index] += word;
    }
  });

  const output = new Uint8Array(variant.outputWords * WORD_BYTES);
  const digest = new DataView(output.buffer);

  for (let i = 0; i < variant.outputWords; i++) {
    digest.setBigUint64(i * WORD_BYTES, state[i]);
  }

  return output;
}

export const Sha384 = {
  /**
   * FIPS 180-4 §6.5 の SHA-384 を専用初期値から計算する。
   * @param input ハッシュ対象のバイト列。
   * @returns 最終状態の先頭 48 バイト。
   */
  digest(input: Uint8Array): Uint8Array {
    return digestSha512Family(input, SHA384);
  },
} as const;

export const Sha512 = {
  /**
   * FIPS 180-4 §6.4 の SHA-512 を計算する。
   * @param input ハッシュ対象のバイト列。
   * @returns 64 バイトのダイジェスト。
   */
  digest(input: Uint8Array): Uint8Array {
    return digestSha512Family(input, SHA512);
  },
} as const;
