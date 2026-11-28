import { expect, test } from "vitest";
import { vectorBytes } from "../../../__tests__/vectors.test.helpers";
import { Sha256 } from "../index";

test.each([
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
])("SHA-256 が NIST の入力 %j のダイジェストと一致する", (message, expected) => {
  const input = new TextEncoder().encode(message);

  expect(Sha256.digest(input)).toEqual(vectorBytes(expected));
});

test.each([
  [55, "463eb28e72f82e0a96c0a4cc53690c571281131f672aa229e0d45ae59b598b59"],
  [56, "da2ae4d6b36748f2a318f23e7ab1dfdf45acdc9d049bd80e59de82a60895f562"],
  [64, "fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108"],
])("%i バイトの SHA-256 ダイジェストが Rust 版と一致する", (length, expected) => {
  const input = Uint8Array.from({ length }, (_, index) => index);

  expect(Sha256.digest(input)).toEqual(vectorBytes(expected));
});
