"""実 Git 差分と pdfmod の配置で、地図の内容と読み取り境界を検証する。"""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/build-pr-change-map.py"
SPEC = importlib.util.spec_from_file_location("pr_change_map", SCRIPT)
MAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MAP)


class TestDeclarations(unittest.TestCase):
    def test_vitest_static_labels_modifiers_and_parameterized_declarations(self):
        source = '''
        test("空の辞書", () => {});
        it.skip('失敗を返す', () => {});
        test.concurrent.each([[1], [2]])("値 %s", () => {});
        test.runIf(true)("条件つき", () => {});
        test(`固定の名前`, () => {});
        test(`動的な ${name}`, () => {});
        test("接頭辞" + value, () => {});
        // test("コメント", () => {});
        /* it("ブロック", () => {}); */
        const example = 'test("文字列", () => {})';
        object.test("無関係なメソッド", () => {});
        '''
        self.assertEqual(MAP.test_names(source, "value.test.ts"), {
            "空の辞書", "失敗を返す", "値 %s", "条件つき", "固定の名前",
        })

    def test_rust_inline_tests_raw_strings_nested_comments_and_lifetimes(self):
        source = r'''
        const EXAMPLE: &str = r##"#[test] fn raw_fake() {}"##;
        const BYTE: &[u8] = br#"#[test] fn byte_fake() {}"#;
        /* outer /* inner */ #[test] fn comment_fake() {} */
        fn helper<'a>(value: &'a str) -> &'a str { value }
        #[cfg(test)] mod tests {
            #[test]
            fn parses_value() {}
            #[test]
            #[should_panic(expected = "missing")]
            fn rejects_missing() {}
            fn helper_not_test() {}
        }
        '''
        self.assertEqual(MAP.test_names(source, "rust/crates/core/src/value.rs"), {
            "parses_value", "rejects_missing",
        })

    def test_rename_and_body_edit_only_report_changed_names(self):
        old = "packages/core/src/__tests__/old.test.ts"
        new = "packages/core/src/__tests__/new.test.ts"
        before = {old: 'test("kept", () => {}); test("removed", () => {});'}
        after = {new: 'test("kept", () => { changed(); }); test("added", () => {});'}
        changes = MAP.test_changes([{"path": new, "oldPath": old}], before, after)
        self.assertEqual(changes, {
            "added": [{"file": new, "name": "added"}],
            "removed": [{"file": new, "name": "removed"}], "files": [new],
        })
        changes = MAP.test_changes([{"path": new, "oldPath": old}], before, {new: before[old]})
        self.assertEqual(changes["added"], [])
        self.assertEqual(changes["removed"], [])

    def test_groups_and_targets_match_pdfmod_layout(self):
        samples = {
            "packages/core/src/lexer/index.ts": "TypeScript · core",
            "packages/react/src/components/PdfPage/index.tsx": "React",
            "rust/crates/core/src/lexer.rs": "Rust",
            "rust/Cargo.toml": "Rust 設定",
            "docs/guides/date-format.html": "PDF 仕様の解説",
            "docs/specs/02_file_structure.md": "仕様・設計",
            ".github/workflows/pr-explain.yml": "CI・開発支援",
        }
        for path, label in samples.items():
            with self.subTest(path=path):
                self.assertEqual(MAP.layer_of(path)[1], label)
        ts = "packages/core/src/lexer/index.ts"
        rust = "rust/crates/core/src/lexer.rs"
        paths = frozenset({ts, rust})
        self.assertEqual(MAP.target_of("packages/core/src/lexer/__tests__/lexer.basic.test.ts", paths), ts)
        self.assertEqual(MAP.target_of("rust/crates/core/src/lexer/tests/error.rs", paths), rust)
        self.assertEqual(MAP.target_of("rust/crates/core/src/lexer/tests.rs", paths), rust)
        self.assertIsNone(MAP.target_of("rust/crates/core/tests/integration.rs", paths))
        self.assertIsNone(MAP.target_of("packages/core/src/lexer/__tests__/lexer.test.ts", paths | {ts + "x"}))

    def test_relative_imports_are_resolved_without_inventing_rust_edges(self):
        snapshot = {
            "packages/core/src/reader/index.ts": 'import { parse } from "../lexer/index.js";\nexport { parse } from "../parser";',
            "packages/core/src/lexer/index.ts": "export const parse = () => {};",
            "packages/core/src/parser/index.ts": "export const parse = () => {};",
            "packages/react/src/index.ts": 'const example = `import { parse } from "../../core/src/parser"`; // import "../../core/src/lexer/index"',
            "rust/crates/core/src/lexer.rs": "use crate::parser;",
            "rust/crates/core/src/parser.rs": "pub fn parse() {}",
        }
        self.assertEqual(MAP.edges_in(snapshot), {
            ("packages/core/src/reader/index.ts", "packages/core/src/lexer/index.ts"),
            ("packages/core/src/reader/index.ts", "packages/core/src/parser/index.ts"),
        })


class GitBoundary(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.git("init", "--quiet", "-b", "main")
        self.git("config", "user.name", "cases")
        self.git("config", "user.email", "cases@example.com")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True, text=True).stdout.strip()

    def write(self, path, text):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "--quiet", "-m", message)
        return self.git("rev-parse", "HEAD")

    def test_real_git_rename_inline_rust_tests_and_inert_python_payload(self):
        old = "packages/core/src/value/__tests__/old.test.ts"
        new = "packages/core/src/value/__tests__/new.test.ts"
        self.write(old, 'test("保持する名前", () => {});\n')
        self.write("rust/crates/core/src/value.rs", "pub struct Value;\n")
        base = self.commit("before")
        (self.root / old).rename(self.root / new)
        self.write("rust/crates/core/src/value.rs", "pub struct Value;\n#[test]\nfn accepts_value() {}\n")
        self.write("harness/tests/test_payload.py", "from pathlib import Path\nPath('executed').touch()\ndef test_inert(): pass\n")
        head = self.commit("rename and add declarations")
        command = ["python3", str(SCRIPT), "--base", base, "--head", head, "--pr", "123", "--head-branch", "topic", "--base-branch", "main"]
        result = subprocess.run(command, cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual({(item["file"], item["name"]) for item in data["tests"]["added"]}, {
            ("harness/tests/test_payload.py", "test_inert"),
            ("rust/crates/core/src/value.rs", "accepts_value"),
        })
        self.assertEqual(data["tests"]["removed"], [])
        file = next(file for group in data["groups"] for file in group["files"] if file["path"] == new)
        self.assertEqual((file["oldPath"], file["status"]), (old, "R"))
        self.assertEqual(len(data["commits"]), 1)
        self.assertFalse((self.root / "executed").exists())
        command[3] = "no-such-ref"
        self.assertNotEqual(subprocess.run(command, cwd=self.root, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
