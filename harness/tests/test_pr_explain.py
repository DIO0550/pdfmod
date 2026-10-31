"""PR の地図・解説の検査・公開境界を、実入力とローカル Git で確かめる。"""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / ".github/scripts"
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
    ENV.pop(name, None)
SPEC = importlib.util.spec_from_file_location("pr_change_map", SCRIPTS / "build-pr-change-map.py")
MAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MAP)

def run(*args, cwd=ROOT):
    return subprocess.run(args, cwd=cwd, env=ENV, text=True, capture_output=True)


class PrExplainRegressionCases(unittest.TestCase):
    def check_cases(self, name):
        result = run("bash", str(SCRIPTS / name))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("NG ", result.stdout)
        self.assertIn("ok ", result.stdout)

    def test_validator_accepts_example_and_rejects_invalid_shape_refs_and_excerpts(self):
        self.check_cases("build-pr-explain-cases.sh")

    def test_template_rejects_dangerous_html_apis_and_external_csp_sources(self):
        self.check_cases("check-pr-explain-template-cases.sh")

    @unittest.skipUnless(shutil.which("node"), "Node.js がないため renderer core は未実施")
    def test_renderer_core_matches_validator_and_all_five_screens(self):
        self.check_cases("pr-explain-core-cases.sh")

    def test_bare_remote_publish_update_delete_preserves_other_prs_and_retries(self):
        self.check_cases("pr-explain-pages-cases.sh")

    def test_local_build_has_checked_explanation_and_rejects_repository_output(self):
        with tempfile.TemporaryDirectory() as work:
            work = Path(work)
            sha = run("git", "rev-parse", "HEAD").stdout.strip()
            explanation = {"version": 1, "pr": 123, "sha": sha, "overview": {"title": "題", "lead": "要約", "before": [], "after": [{"text": "後"}]}}
            source = work / "input.json"
            source.write_text(json.dumps(explanation), encoding="utf-8")
            output = work / "html"
            command = ["python3", str(SCRIPTS / "build-pr-explain-local.py"), "--base", "HEAD~1", "--head", "HEAD", "--pr", "123", "--head-branch", "topic", "--base-branch", "main", "--out", str(output)]
            result = run(*command, "--explain", str(source))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual({file.name for file in output.iterdir()}, {"index.html", "explain.json", "change-map.json"})
            self.assertEqual(json.loads((output / "explain.json").read_text())["sha"], sha)
            self.assertEqual(run(*command).returncode, 0)
            self.assertFalse((output / "explain.json").exists())
            self.assertEqual(run(*command[:-1], str(ROOT / "generated")).returncode, 2)
            explanation["unknown"] = True
            source.write_text(json.dumps(explanation), encoding="utf-8")
            (output / "index.html").write_text("unchanged", encoding="utf-8")
            self.assertEqual(run(*command, "--explain", str(source)).returncode, 1)
            self.assertEqual((output / "index.html").read_text(), "unchanged")


if __name__ == "__main__":
    unittest.main()
