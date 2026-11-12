import type { PdfWarning } from "../../../../pdf/errors/index";
import { err, ok } from "../../../../utils/result/index";
import type {
  OperatorHandler,
  OperatorHandlerContext,
} from "../../../operator-registry/index";
import { ContentStreamResources } from "../../../resources/index";
import { OperandExtractor } from "../../operand-extractor/index";

const OPERATOR_NAME = "Do";

/**
 * PDF §8.8 `Do` operator (invoke named XObject) のハンドラ。
 *
 * 名前を消費し、リソーススコープがあれば画像・フォーム等のストリームを引く。
 * 描画やフォームの入れ子実行は後段が担う。
 */
export const doHandler: OperatorHandler = (context: OperatorHandlerContext) => {
  const nameResult = OperandExtractor.popName(
    context.operandStack,
    OPERATOR_NAME,
  );
  if (!nameResult.ok) {
    return err(nameResult.error);
  }

  const name = nameResult.value;
  const resolved = context.resources?.getXObject(name);
  if (resolved === undefined || (resolved.ok && resolved.value.some)) {
    return ok(context);
  }

  const warning: PdfWarning = resolved.ok
    ? {
        code: "XOBJECT_NOT_FOUND",
        message: `XObject resource not found: /${name}`,
      }
    : ContentStreamResources.warning(
        { category: "XObject", name },
        resolved.error,
      );
  return ok({ ...context, warnings: [warning] });
};
