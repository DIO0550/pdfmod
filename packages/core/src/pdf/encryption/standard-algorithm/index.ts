import { none, type Option, some } from "../../../utils/option/index";
import { map, ok, type Result } from "../../../utils/result/index";
import type { PdfDictionaryReader } from "../../dictionary-reader/index";
import { EncryptDictReader } from "../dict-reader/index";
import type { EncryptError } from "../error/index";
import { V1R2 } from "./v1r2/index";
import { V1R3 } from "./v1r3/index";
import { V2R3 } from "./v2r3/index";
import { V4R4 } from "./v4r4/index";
import { V5R5 } from "./v5r5/index";
import { V5R6 } from "./v5r6/index";

export { AesKeyMaterial } from "./aes-key-material/index";
export { V1R2 } from "./v1r2/index";
export { V1R3 } from "./v1r3/index";
export { V2R3 } from "./v2r3/index";
export { V4R4 } from "./v4r4/index";
export { V5R5 } from "./v5r5/index";
export { V5R6 } from "./v5r6/index";

/** 有効な6組の方式。各方式が自身の生成処理を持つ。 */
export type StandardAlgorithm = V1R2 | V1R3 | V2R3 | V4R4 | V5R5 | V5R6;

export const StandardAlgorithm = {
  /** /V と /R を読み、対応外の組は None とする。 */
  fromDictionary(
    reader: PdfDictionaryReader,
  ): Result<Option<StandardAlgorithm>, EncryptError> {
    const version = EncryptDictReader.required(reader, {
      key: "V",
      type: "integer",
    });

    if (!version.ok) {
      return version;
    }

    const revision = EncryptDictReader.required(reader, {
      key: "R",
      type: "integer",
    });

    if (!revision.ok) {
      return revision;
    }

    switch (`${version.value.value}:${revision.value.value}`) {
      case "1:2":
        return ok(some(V1R2.create()));

      case "1:3":
        return ok(some(V1R3.create()));

      case "2:3":
        return map(V2R3.fromDictionary(reader), some);

      case "4:4":
        return map(V4R4.fromDictionary(reader), some);

      case "5:5":
        return map(V5R5.fromDictionary(reader), some);

      case "5:6":
        return map(V5R6.fromDictionary(reader), some);

      default:
        return ok(none);
    }
  },

  /** ファイル暗号鍵の長さをビット単位で返す。 */
  keyLength<T extends StandardAlgorithm>(algorithm: T): T["keyLength"] {
    return algorithm.keyLength;
  },
} as const;
