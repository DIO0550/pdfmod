import { err, ok, type Result } from "../../../../utils/result/index";

const MIN_KEY_BYTES = 5;
const MAX_KEY_BYTES = 16;
const STATE_SIZE = 256;
const BYTE_MASK = STATE_SIZE - 1;

type Rc4Input = {
  readonly key: Uint8Array;
  readonly data: Uint8Array;
};

/** 旧形式 PDF の標準セキュリティハンドラが使う RC4。 */
export const Rc4 = {
  /**
   * 新しい鍵ストリームを作り、入力全体に XOR する。同じ操作で暗号化と復号ができる。
   * @param input PDF の鍵と暗号化または復号するバイト列。
   * @returns 変換済みのバイト列。鍵が 5〜16 バイトでなければ長さエラー。
   */
  apply({ key, data }: Rc4Input): Result<Uint8Array, "INVALID_KEY_LENGTH"> {
    if (key.length < MIN_KEY_BYTES || key.length > MAX_KEY_BYTES) {
      return err("INVALID_KEY_LENGTH");
    }

    const permutation = Uint8Array.from(
      { length: STATE_SIZE },
      (_, index) => index,
    );

    function swap(first: number, second: number): void {
      const value = permutation[first];
      permutation[first] = permutation[second];
      permutation[second] = value;
    }

    let j = 0;

    for (let i = 0; i < STATE_SIZE; i++) {
      j = (j + permutation[i] + key[i % key.length]) & BYTE_MASK;
      swap(i, j);
    }

    // 鍵による初期化の後、鍵ストリームの添字は両方とも 0 から始める。
    let i = 0;
    j = 0;

    const output = new Uint8Array(data.length);

    for (let offset = 0; offset < data.length; offset++) {
      i = (i + 1) & BYTE_MASK;
      j = (j + permutation[i]) & BYTE_MASK;
      swap(i, j);

      const index = (permutation[i] + permutation[j]) & BYTE_MASK;
      output[offset] = data[offset] ^ permutation[index];
    }

    return ok(output);
  },
} as const;
