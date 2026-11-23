import { assert } from "vitest";
import { vectorBytes } from "../../__tests__/vectors.test.helpers";
import { Aes } from "../index";

export function createAes(hexKey: string): Aes {
  const result = Aes.create(vectorBytes(hexKey));
  assert(result.ok);
  return result.value;
}
