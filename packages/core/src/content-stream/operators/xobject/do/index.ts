import { PdfXObjectSubtype } from "../../../../document/resources/xobject/index";
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
 * 現在のリソーススコープで名前を引き、Image または Form をインタプリタへ渡す。
 * @param context - 名前オペランドと実行スコープを持つコンテキスト
 * @returns 解決した描画対象かリソース警告。オペランドが不正なら Err
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
  const resources = context.resources;
  if (resources === undefined) {
    return ok(context);
  }

  const resolved = resources.getXObject(name);
  if (!resolved.ok) {
    const warning = ContentStreamResources.warning(
      { category: "XObject", name },
      resolved.error,
    );
    return ok({ ...context, warnings: [warning] });
  }

  if (!resolved.value.some) {
    return ok({
      ...context,
      warnings: [
        {
          code: "XOBJECT_NOT_FOUND",
          message: `XObject resource not found: /${name}`,
        },
      ],
    });
  }

  const object = resolved.value.value;
  switch (object.subtype) {
    case PdfXObjectSubtype.Image:
    case PdfXObjectSubtype.Form:
      return ok({ ...context, xObject: { name, object, resources } });
    case PdfXObjectSubtype.PS:
    case PdfXObjectSubtype.Unknown:
      return ok(context);
  }
};
