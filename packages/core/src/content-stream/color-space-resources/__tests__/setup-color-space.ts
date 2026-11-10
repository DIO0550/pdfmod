import { assert } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import type { PdfError } from "../../../pdf/errors/index";
import type { Result } from "../../../utils/result/index";
import type { ContentStreamInterpreterResult } from "../../interpreter/index";
import { ContentStreamInterpreter } from "../../interpreter/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { PaintResources } from "../../paint-resources/index";
import { ColorSpaceResources } from "../index";

/**
 * 実バイト列のリソースを解決して色命令を実行する。
 * @param source - リソース辞書・間接オブジェクト・命令列
 * @returns インタプリタの実行結果
 */
export async function executeColorSpace(source: {
  readonly resources: string;
  readonly objects?: readonly string[];
  readonly content: string;
}): Promise<Result<ContentStreamInterpreterResult, PdfError>> {
  const { resources, resolveRef } = setupResources(source);
  const prepared = await ColorSpaceResources.fromResources(
    resources,
    resolveRef,
  );
  assert(prepared.ok);
  const paints = await PaintResources.fromResources(resources, resolveRef);
  assert(paints.ok);

  const registry = OperatorRegistry.createDefault(
    undefined,
    prepared.value,
    paints.value,
  );
  assert(registry.ok);

  return ContentStreamInterpreter.execute({
    data: new TextEncoder().encode(source.content),
    registry: registry.value,
  });
}
