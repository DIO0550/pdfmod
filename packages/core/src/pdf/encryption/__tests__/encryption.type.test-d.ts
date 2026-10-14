import { expectTypeOf, test } from "vitest";
import type {
  CryptFilterMethod,
  EncryptDictionary,
  KeyLength,
  StandardAlgorithm,
} from "../../../index";

test("/V と /R の有効な6組だけを型として表現できる", () => {
  expectTypeOf<StandardAlgorithm["kind"]>().toEqualTypeOf<
    "V1R2" | "V1R3" | "V2R3" | "V4R4" | "V5R5" | "V5R6"
  >();
  expectTypeOf<{ kind: "V1R6" }>().not.toExtend<StandardAlgorithm>();
  expectTypeOf<{ version: 1; revision: 6 }>().not.toExtend<StandardAlgorithm>();
  // 不正な組を型として構築できないことをコンパイラでも確認する。
  // @ts-expect-error V1R6 は仕様上の組み合わせではない。
  const invalid: StandardAlgorithm = { kind: "V1R6" };
  expectTypeOf(invalid).toEqualTypeOf<StandardAlgorithm>();
});

test("V4R4 には crypt filter が必須で V5R6 には追加鍵が必須", () => {
  expectTypeOf<{
    kind: "V4R4";
    keyLength: 40;
  }>().not.toExtend<StandardAlgorithm>();
  expectTypeOf<{ kind: "V5R6" }>().not.toExtend<StandardAlgorithm>();
  expectTypeOf<
    Extract<StandardAlgorithm, { kind: "V1R2" }>
  >().not.toHaveProperty("keys");
});

test("鍵長と暗号方式には任意の数値や文字列を渡せない", () => {
  expectTypeOf<number>().not.toExtend<KeyLength>();
  expectTypeOf<44>().not.toExtend<KeyLength>();
  expectTypeOf<string>().not.toExtend<CryptFilterMethod>();
});

test("未対応辞書は生辞書を保持して標準ハンドラとは区別される", () => {
  expectTypeOf<
    Extract<EncryptDictionary, { type: "Unsupported" }>
  >().toHaveProperty("raw");
  expectTypeOf<
    Extract<EncryptDictionary, { type: "Standard" }>
  >().not.toHaveProperty("raw");
});
