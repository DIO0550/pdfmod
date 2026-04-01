import type { PdfParseError } from "../errors/index";
import type { Result } from "../result/index";
import { err, ok } from "../result/index";
import type { PdfObject } from "../types/pdf-types/index";

export const PdfFilter = {
  validate(
    entries: Map<string, PdfObject>,
  ): Result<string | undefined, PdfParseError> {
    const entry = entries.get("Filter");
    if (entry === undefined) {
      return ok(undefined);
    }
    if (entry.type === "array") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "/Filter as array (multi-stage filter) is not supported",
      });
    }
    if (entry.type !== "name") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: "/Filter must be a name",
      });
    }
    if (entry.value !== "FlateDecode") {
      return err({
        code: "OBJECT_STREAM_INVALID",
        message: `/Filter /${entry.value} is not supported`,
      });
    }
    return ok(entry.value);
  },
} as const;
