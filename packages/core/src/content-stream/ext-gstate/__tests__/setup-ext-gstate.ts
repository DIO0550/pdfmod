import { assert } from "vitest";
import { setupResources } from "../../../document/resources/__tests__/setup-resources";
import type { PdfError } from "../../../pdf/errors/index";
import type { Result } from "../../../utils/result/index";
import {
  ContentStreamInterpreter,
  type ContentStreamInterpreterResult,
} from "../../interpreter/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { ExtGStateResources } from "../index";

/**
 * PDF 断片のリソースを実ストアで解決し、コンテンツストリームを実行する。
 * @param source - リソース辞書、間接オブジェクト、命令列
 * @returns インタプリタの実行結果
 */
export async function executeExtGState(source: {
  readonly resources: string;
  readonly objects?: readonly string[];
  readonly content: string;
}): Promise<Result<ContentStreamInterpreterResult, PdfError>> {
  const { resources, resolveRef } = setupResources(source);
  const prepared = await ExtGStateResources.fromResources(
    resources,
    resolveRef,
  );
  assert(prepared.ok);
  const registry = OperatorRegistry.createDefault(prepared.value);
  assert(registry.ok);

  return ContentStreamInterpreter.execute({
    data: new TextEncoder().encode(source.content),
    registry: registry.value,
  });
}
