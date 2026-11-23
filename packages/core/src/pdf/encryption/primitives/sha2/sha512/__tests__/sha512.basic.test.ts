import { expect, test } from "vitest";
import { vectorBytes } from "../../../__tests__/vectors.test.helpers";
import { Sha384, Sha512 } from "../index";

const longMessage =
  "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno" +
  "ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";

test.each([
  [
    Sha384,
    "abc",
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded163" +
      "1a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
  ],
  [
    Sha384,
    longMessage,
    "09330c33f71147e83d192fc782cd1b4753111b173b3b05d2" +
      "2fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039",
  ],
  [
    Sha512,
    "abc",
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
      "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  ],
  [
    Sha512,
    longMessage,
    "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018" +
      "501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909",
  ],
])("SHA-384/512 が NIST の入力 %j の既知のダイジェストと一致する", (algorithm, message, expected) => {
  const input = new TextEncoder().encode(message);

  expect(algorithm.digest(input)).toEqual(vectorBytes(expected));
});

test.each([
  [
    Sha384,
    111,
    "f5f9fe110d809d34029de262a01b208356caec6e054c7f92" +
      "6b2591f6c9780579d4b59f5578c6f531a84f158a33660cef",
  ],
  [
    Sha384,
    128,
    "ca2385773319124534111a36d0581fc3f00815e907034b90" +
      "cff9c3a861e126a741d5dfcff65a417b6d7296863ac0ec17",
  ],
  [
    Sha512,
    111,
    "a1a111449b198d9b1f538bad7f3fc1022b3a5b1a5e90a0bc860de8512746cbc3" +
      "1599e6c834de3a3235327af0b51ff57bf7acf1974a73014d9c3953812edc7c8d",
  ],
  [
    Sha512,
    128,
    "1dffd5e3adb71d45d2245939665521ae001a317a03720a45732ba1900ca3b835" +
      "1fc5c9b4ca513eba6f80bc7b1d1fdad4abd13491cb824d61b08d8c0e1561b3f7",
  ],
])("SHA-384/512 の %j に %i バイトを渡すと Rust 版と一致する", (algorithm, length, expected) => {
  const buffer = Uint8Array.from(
    { length: length + 2 },
    (_, index) => index - 1,
  );

  expect(algorithm.digest(buffer.subarray(1, -1))).toEqual(
    vectorBytes(expected),
  );
});
