import type { PdfParseError, PdfParseErrorCode } from "../errors/index";
import type { Result } from "../result/index";
import { err, ok } from "../result/index";
import type { PdfObject } from "../types/pdf-types/index";

export const PdfType = {
  validate(
    entries: Map<string, PdfObject>,
    expected: string,
    errorCode: PdfParseErrorCode = "OBJECT_STREAM_INVALID",
  ): Result<void, PdfParseError> {
    const entry = entries.get("Type");
    if (entry === undefined || entry.type !== "name") {
      return err({
        code: errorCode,
        message: `Dictionary missing /Type or /Type is not a name`,
      });
    }
    if (entry.value !== expected) {
      return err({
        code: errorCode,
        message: `/Type must be /${expected}, got /${entry.value}`,
      });
    }
    return ok(undefined);
  },
} as const;
