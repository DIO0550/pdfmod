import { HashBlockLayouts, visitHashBlocks } from "../hash-blocks/index";
import { readHexWords } from "../hex-words/index";
import { Word32 } from "../word32/index";

const WORD_BYTES = 4;
const WORDS_PER_BLOCK = HashBlockLayouts.Md5.blockBytes / WORD_BYTES;

const INITIAL_STATE = /* @__PURE__ */ readHexWords(
  `
  67452301 efcdab89 98badcfe 10325476
`,
  Number,
);

const STEP_CONSTANTS = /* @__PURE__ */ readHexWords(
  `
  d76aa478 e8c7b756 242070db c1bdceee f57c0faf 4787c62a a8304613 fd469501
  698098d8 8b44f7af ffff5bb1 895cd7be 6b901122 fd987193 a679438e 49b40821
  f61e2562 c040b340 265e5a51 e9b6c7aa d62f105d 02441453 d8a1e681 e7d3fbc8
  21e1cde6 c33707d6 f4d50d87 455a14ed a9e3e905 fcefa3f8 676f02d9 8d2a4c8a
  fffa3942 8771f681 6d9d6122 fde5380c a4beea44 4bdecfa9 f6bb4b60 bebfbc70
  289b7ec6 eaa127fa d4ef3085 04881d05 d9d4d039 e6db99e5 1fa27cf8 c4ac5665
  f4292244 432aff97 ab9423a7 fc93a039 655b59c3 8f0ccc92 ffeff47d 85845dd1
  6fa87e4f fe2ce6e0 a3014314 4e0811a1 f7537e82 bd3af235 2ad7d2bb eb86d391
`,
  Number,
);

type WorkingState = {
  readonly b: number;
  readonly c: number;
  readonly d: number;
};

// RFC 1321 §3.4 の F、G、H、I。各グループは別の順番で入力ワードを選ぶ。
const ROUNDS = [
  {
    mix: ({ b, c, d }: WorkingState) => (b & c) | (~b & d),
    stride: 1,
    firstWord: 0,
    shifts: /* @__PURE__ */ readHexWords("07 0c 11 16", Number),
  },
  {
    mix: ({ b, c, d }: WorkingState) => (b & d) | (c & ~d),
    selectWord: (step: number) =>
      (ROUND_WORD_SELECTION.G.stride * step + ROUND_WORD_SELECTION.G.first) %
      WORDS_PER_BLOCK,
    shifts: /* @__PURE__ */ readHexWords("05 09 0e 14", Number),
  },
  {
    mix: ({ b, c, d }: WorkingState) => b ^ c ^ d,
    selectWord: (step: number) =>
      (ROUND_WORD_SELECTION.H.stride * step + ROUND_WORD_SELECTION.H.first) %
      WORDS_PER_BLOCK,
    shifts: /* @__PURE__ */ readHexWords("04 0b 10 17", Number),
  },
  {
    mix: ({ b, c, d }: WorkingState) => c ^ (b | ~d),
    selectWord: (step: number) =>
      (ROUND_WORD_SELECTION.I.stride * step) % WORDS_PER_BLOCK,
    shifts: /* @__PURE__ */ readHexWords("06 0a 0f 15", Number),
  },
] as const;

/** 旧リビジョンの PDF の標準セキュリティハンドラが使う MD5。 */
export const Md5 = {
  /**
   * RFC 1321 の MD5 を計算する。
   * @param input ハッシュ対象のバイト列。
   * @returns 16 バイトのダイジェスト。
   */
  digest(input: Uint8Array): Uint8Array {
    const state = new Uint32Array(INITIAL_STATE);

    visitHashBlocks(input, HashBlockLayouts.Md5, (view, offset) => {
      let [a, b, c, d] = state;
      let constantIndex = 0;

      for (const round of ROUNDS) {
        for (let step = 0; step < WORDS_PER_BLOCK; step++) {
          const wordIndex =
            (round.stride * step + round.firstWord) % WORDS_PER_BLOCK;
          const messageOffset = offset + wordIndex * WORD_BYTES;
          const messageWord = view.getUint32(messageOffset, true);
          const word =
            a +
            round.mix({ b, c, d }) +
            messageWord +
            STEP_CONSTANTS[constantIndex];
          const bits = round.shifts[step % round.shifts.length];
          const next = (b + Word32.rotateLeft({ word, bits })) >>> 0;

          a = d;
          d = c;
          c = b;
          b = next;
          constantIndex++;
        }
      }

      for (const [index, word] of [a, b, c, d].entries()) {
        state[index] += word;
      }
    });

    const output = new Uint8Array(state.byteLength);
    const digest = new DataView(output.buffer);

    for (const [index, word] of state.entries()) {
      digest.setUint32(index * WORD_BYTES, word, true);
    }

    return output;
  },
} as const;
