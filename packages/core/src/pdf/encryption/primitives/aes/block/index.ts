import { multiplyByX, S_BOX } from "../byte/index";

export const AES_BLOCK_BYTES = 16;
const COLUMN_BYTES = 4;

function createInverseSBox(): Uint8Array {
  const inverse = new Uint8Array(S_BOX.length);

  for (const [input, output] of S_BOX.entries()) {
    inverse[output] = input;
  }

  return inverse;
}

// 状態行列は列順。ShiftRows は同じ行の移動元を列番号から求める。
function createShiftRows(direction: 1 | -1): Uint8Array {
  return Uint8Array.from({ length: AES_BLOCK_BYTES }, (_, index) => {
    const row = index % COLUMN_BYTES;
    const column = Math.floor(index / COLUMN_BYTES);
    const sourceColumn =
      (column + direction * row + COLUMN_BYTES) % COLUMN_BYTES;
    return sourceColumn * COLUMN_BYTES + row;
  });
}
const FORWARD = {
  box: S_BOX,
  sourceIndices: /* @__PURE__ */ createShiftRows(1),
} as const;

const INVERSE = {
  box: /* @__PURE__ */ createInverseSBox(),
  sourceIndices: /* @__PURE__ */ createShiftRows(-1),
} as const;

type Substitution = typeof FORWARD | typeof INVERSE;
type TransformBlock = (data: Uint8Array, offset: number) => Uint8Array;
type BlockCipher = {
  readonly encrypt: TransformBlock;
  readonly decrypt: TransformBlock;
};

/**
 * FIPS 197 §5.1・§5.3 の 1 ブロック変換を組み立てる。
 * @param roundKeys 生成済みのラウンド鍵。
 * @returns 作業用の 16 バイトを再利用する変換器。結果は次の変換前に読み取る。
 */
export function createBlockCipher(roundKeys: Uint8Array): BlockCipher {
  const state = new Uint8Array(AES_BLOCK_BYTES);
  const shifted = new Uint8Array(AES_BLOCK_BYTES);
  const lastRoundOffset = roundKeys.length - AES_BLOCK_BYTES;

  function loadBlock(data: Uint8Array, offset: number): void {
    for (let i = 0; i < AES_BLOCK_BYTES; i++) {
      state[i] = data[offset + i];
    }
  }

  function addRoundKey(keyOffset: number): void {
    for (let i = 0; i < AES_BLOCK_BYTES; i++) {
      state[i] ^= roundKeys[keyOffset + i];
    }
  }

  function substituteAndShift({ box, sourceIndices }: Substitution): void {
    for (let i = 0; i < AES_BLOCK_BYTES; i++) {
      shifted[i] = box[state[sourceIndices[i]]];
    }

    state.set(shifted);
  }

  function mixColumns(inverse: boolean): void {
    for (let i = 0; i < AES_BLOCK_BYTES; i += COLUMN_BYTES) {
      let a = state[i];
      let b = state[i + 1];
      let c = state[i + 2];
      const end = i + COLUMN_BYTES - 1;
      let d = state[end];

      if (inverse) {
        // 逆行列の前処理を適用すると、残りは通常の MixColumns と同じ式で計算できる。
        const even = multiplyByX(multiplyByX(a ^ c));
        const odd = multiplyByX(multiplyByX(b ^ d));
        a ^= even;
        b ^= odd;
        c ^= even;
        d ^= odd;
      }

      const all = a ^ b ^ c ^ d;
      state[i] = a ^ all ^ multiplyByX(a ^ b);
      state[i + 1] = b ^ all ^ multiplyByX(b ^ c);
      state[i + 2] = c ^ all ^ multiplyByX(c ^ d);
      state[end] = d ^ all ^ multiplyByX(d ^ a);
    }
  }

  return {
    encrypt(data, offset) {
      loadBlock(data, offset);
      addRoundKey(0);

      for (
        let round = AES_BLOCK_BYTES;
        round < lastRoundOffset;
        round += AES_BLOCK_BYTES
      ) {
        substituteAndShift(FORWARD);
        mixColumns(false);
        addRoundKey(round);
      }

      substituteAndShift(FORWARD);
      addRoundKey(lastRoundOffset);
      return state;
    },

    decrypt(data, offset) {
      loadBlock(data, offset);
      addRoundKey(lastRoundOffset);

      for (
        let round = lastRoundOffset - AES_BLOCK_BYTES;
        round > 0;
        round -= AES_BLOCK_BYTES
      ) {
        substituteAndShift(INVERSE);
        addRoundKey(round);
        mixColumns(true);
      }

      substituteAndShift(INVERSE);
      addRoundKey(0);
      return state;
    },
  };
}
