/** LZW テストでコード幅を明示する符号列。幅の切り替え規則は実装しない。 */
interface LzwCodeSegment {
  readonly width: number;
  readonly codes: readonly number[];
}

/** LZW のテスト用符号列を、指定した幅のまま MSB 順でパックする。
 * @param segments - 明示的なビット幅とコード列
 * @returns EOD や ClearTable を補完しない入力バイト列
 */
export function lzwFixture(segments: readonly LzwCodeSegment[]): Uint8Array {
  const bits = segments
    .flatMap(({ width, codes }) =>
      codes.map((code) => code.toString(2).padStart(width, "0")),
    )
    .join("");
  const bitsPerByte = 8;
  return Uint8Array.from(
    { length: Math.ceil(bits.length / bitsPerByte) },
    (_, index) =>
      Number.parseInt(
        bits
          .slice(index * bitsPerByte, (index + 1) * bitsPerByte)
          .padEnd(bitsPerByte, "0"),
        2,
      ),
  );
}
