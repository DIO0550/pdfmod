/** 公開ベクタの 16 進表記を、実際に比較するテスト入力と期待値にする。 */
export function vectorBytes(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(2 * index, 2 * index + 2), 16),
  );
}
