import { assert } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import type { PdfError } from "../../../pdf/errors/index";
import type { Result } from "../../../utils/result/index";
import { ColorSpaceResources } from "../../color-space-resources/index";
import type { ContentStreamInterpreterResult } from "../../interpreter/index";
import { ContentStreamInterpreter } from "../../interpreter/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { PaintResources } from "../index";

/**
 * 実バイト列から現在の描画スコープとインタプリタを準備する。
 * @param source - リソース辞書と間接オブジェクト本体
 * @returns 解決済みリソースと、同じスコープで命令を実行する関数
 */
export async function setupPaint(source: {
  readonly resources: string;
  readonly objects?: readonly string[];
}): Promise<{
  readonly paints: PaintResources;
  readonly execute: (
    content: string,
  ) => Result<ContentStreamInterpreterResult, PdfError>;
}> {
  const { resources, resolveRef } = setupResources(source);
  const spaces = await ColorSpaceResources.fromResources(resources, resolveRef);
  assert(spaces.ok);

  const paints = await PaintResources.fromResources(resources, resolveRef);
  assert(paints.ok);

  const registry = OperatorRegistry.createDefault(
    undefined,
    spaces.value,
    paints.value,
  );
  assert(registry.ok);

  return {
    paints: paints.value,
    execute: (content: string) =>
      ContentStreamInterpreter.execute({
        data: new TextEncoder().encode(content),
        registry: registry.value,
      }),
  };
}

/**
 * 最小のタイリングセルをPDFストリームとして組み立てる。
 * @param entries - 既定の属性へ上書きする辞書エントリ
 * @returns 間接オブジェクト本体へ置くストリーム
 */
export function tilingPattern(entries = ""): string {
  return `<< /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 8 8] /XStep 8 /YStep 8 /Resources <<>> ${entries} /Length 0 >>\nstream\n\nendstream`;
}
