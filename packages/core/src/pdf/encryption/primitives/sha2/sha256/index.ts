import { HashBlockLayouts, visitHashBlocks } from "../../hash-blocks/index";
import { readHexWords } from "../../hex-words/index";
import { Word32 } from "../../word32/index";

const WORD_BYTES = 4;
const SCHEDULE_SIGMA0_SHIFT = 3;
const SCHEDULE_SIGMA1_SHIFT = 10;
const SCHEDULE_PRIOR_WORD_OFFSET = 7;
const MESSAGE_WORDS = HashBlockLayouts.Sha256.blockBytes / WORD_BYTES;

const INITIAL_STATE = /* @__PURE__ */ readHexWords(
  `
  6a09e667 bb67ae85 3c6ef372 a54ff53a 510e527f 9b05688c 1f83d9ab 5be0cd19
`,
  Number,
);

const ROUND_CONSTANTS = /* @__PURE__ */ readHexWords(
  `
  428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5
  d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174
  e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da
  983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967
  27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85
  a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070
  19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3
  748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2
`,
  Number,
);

function scheduleSigma0(word: number): number {
  return (
    Word32.rotateRight({ word, bits: 7 }) ^
    Word32.rotateRight({ word, bits: 18 }) ^
    (word >>> SCHEDULE_SIGMA0_SHIFT)
  );
}

function scheduleSigma1(word: number): number {
  return (
    Word32.rotateRight({ word, bits: 17 }) ^
    Word32.rotateRight({ word, bits: 19 }) ^
    (word >>> SCHEDULE_SIGMA1_SHIFT)
  );
}

function roundSigma0(word: number): number {
  return (
    Word32.rotateRight({ word, bits: 2 }) ^
    Word32.rotateRight({ word, bits: 13 }) ^
    Word32.rotateRight({ word, bits: 22 })
  );
}

function roundSigma1(word: number): number {
  return (
    Word32.rotateRight({ word, bits: 6 }) ^
    Word32.rotateRight({ word, bits: 11 }) ^
    Word32.rotateRight({ word, bits: 25 })
  );
}

export const Sha256 = {
  /**
   * FIPS 180-4 §6.2 の SHA-256 を計算する。
   * @param input ハッシュ対象のバイト列。
   * @returns 32 バイトのダイジェスト。
   */
  digest(input: Uint8Array): Uint8Array {
    const state = new Uint32Array(INITIAL_STATE);
    const schedule = new Uint32Array(ROUND_CONSTANTS.length);

    visitHashBlocks(input, HashBlockLayouts.Sha256, (view, offset) => {
      for (let i = 0; i < MESSAGE_WORDS; i++) {
        schedule[i] = view.getUint32(offset + i * WORD_BYTES);
      }

      for (let i = MESSAGE_WORDS; i < schedule.length; i++) {
        // FIPS 180-4 §6.2.2 の W[t-16]、W[t-15]、W[t-7]、W[t-2] を再利用する。
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
        const t1 =
          h + roundSigma1(e) + choice + ROUND_CONSTANTS[i] + schedule[i];
        const t2 = roundSigma0(a) + majority;

        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }

      for (const [index, word] of [a, b, c, d, e, f, g, h].entries()) {
        state[index] += word;
      }
    });

    const output = new Uint8Array(state.byteLength);
    const digest = new DataView(output.buffer);

    for (const [index, word] of state.entries()) {
      digest.setUint32(index * WORD_BYTES, word);
    }

    return output;
  },
} as const;
