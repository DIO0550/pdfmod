/**
 * 規格の定数表を空白区切りの 16 進数で宣言し、モジュール初期化時に読み込む。
 * @param table 固定の定数表。
 * @param parse ワード幅に応じた Number または BigInt。
 * @returns 規格と同じ順に並んだ定数。
 */
export function readHexWords<T extends number | bigint>(
  table: string,
  parse: (word: string) => T,
): readonly T[] {
  return table
    .trim()
    .split(/\s+/)
    .map((word) => parse(`0x${word}`));
}
