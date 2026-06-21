import { assert, expect, test } from "vitest";
import {
  type OperatorHandler,
  OperatorRegistry,
} from "../../../../operator-registry/index";
import { doHandler, registerXObjectOperators } from "../index";

// [重複させる operator 名, その handler]
test.each<readonly [string, OperatorHandler]>([
  ["Do", doHandler],
])("%s が登録済みのとき registerXObjectOperators は OPERATOR_ALREADY_REGISTERED の Err を返す", (name, handler) => {
  // 事前に該当 operator を登録した seed registry を用意する
  const seed = OperatorRegistry.register(
    OperatorRegistry.create(),
    name,
    handler,
  );
  assert(seed.ok);

  const result = registerXObjectOperators(seed.value);

  // 観察可能な振る舞いのみを検証する:
  // Err 戻り値・エラーコード・operatorName が重複させた名前と一致すること。
  // reduce + flatMap による短絡そのものは実装詳細のため検証しない。
  // operator が複数件になったタイミングで「短絡時点の後続 operator が has=false」を
  // 振る舞いベースで追加検証する。
  assert(!result.ok);
  assert(result.error.code === "OPERATOR_ALREADY_REGISTERED");
  expect(result.error.operatorName).toBe(name);
});
