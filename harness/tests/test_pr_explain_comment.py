"""公開した版の解説リンクだけを、実 workflow の投稿スクリプトで検証する。"""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/pr-explain-deploy.yml"
WORKFLOW_SOURCE = WORKFLOW.read_text(encoding="utf-8")
SCRIPT = textwrap.dedent(WORKFLOW_SOURCE.split("          script: |\n", 1)[1])
PR_WORKFLOW_SOURCE = (ROOT / ".github/workflows/pr-explain.yml").read_text(encoding="utf-8")
CLOSE_STEP = PR_WORKFLOW_SOURCE.split("      - name: Mark existing comment as closed\n", 1)[1]
CLOSE_SCRIPT = textwrap.dedent(CLOSE_STEP.split("          script: |\n", 1)[1])
NODE = shutil.which("node")
MARKER = "<!-- pdfmod-pr-explain -->"
SHA = "a" * 40
RUNNER = r"""
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const calls = [];
const fail = status => {
  const error = Error(`GitHub status ${status}`);
  error.status = status;
  throw error;
};
const github = {
  rest: {
    pulls: {
      get: async args => {
        calls.push({ operation: 'get', ...args });
        if (input.errors[args.pull_number]) {
          fail(input.errors[args.pull_number]);
        }
        if (!input.prs[args.pull_number]) {
          fail(404);
        }
        return { data: input.prs[args.pull_number] };
      }
    },
    issues: {
      listComments: 'comments',
      createComment: async args => calls.push({ operation: 'create', ...args }),
      updateComment: async args => calls.push({ operation: 'update', ...args })
    }
  },
  paginate: async (route, args) => {
    if (route !== 'comments') {
      throw Error('Unexpected API');
    }
    calls.push({ operation: 'comments', ...args });
    if (input.commentError) {
      fail(input.commentError);
    }
    return input.comments[args.issue_number] || [];
  }
};
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
(async () => {
  await new AsyncFunction('github', 'context', 'require', input.script)(
    github, input.context, require
  );
  process.stdout.write(JSON.stringify(calls));
})().catch(error => { console.error(error); process.exitCode = 1; });
"""


class PrExplainCommentWiring(unittest.TestCase):
    def test_comment_runs_after_successful_deploy_in_same_job_and_reads_its_site(self):
        self.assertLess(WORKFLOW_SOURCE.index("      - name: Deploy site"), WORKFLOW_SOURCE.index("      - name: Comment published PR links"))
        comment_step = WORKFLOW_SOURCE.split("      - name: Comment published PR links\n", 1)[1]
        self.assertIn("if: success() && steps.deployment.outcome == 'success'", comment_step)
        self.assertIn("PR_EXPLAIN_PAGE_URL: ${{ steps.deployment.outputs.page_url }}", comment_step)
        self.assertIn("      pull-requests: write\n", WORKFLOW_SOURCE)
        self.assertEqual(re.findall(r"^  ([a-z][a-z-]*):$", WORKFLOW_SOURCE, re.M)[-1], "deploy")
        self.assertEqual(WORKFLOW_SOURCE.count("uses: actions/checkout@"), 1)
        self.assertIn("ref: gh-pages\n          path: site", WORKFLOW_SOURCE)
        self.assertNotIn("child_process", SCRIPT)
        self.assertNotIn("fetch(", SCRIPT)
        self.assertNotIn("${{ github.event.pull_request.head", WORKFLOW_SOURCE)

    def test_map_workflow_only_updates_existing_comment_when_pr_is_closed(self):
        self.assertIn("github.event.action == 'closed'", CLOSE_STEP)
        self.assertNotIn("createComment", PR_WORKFLOW_SOURCE)
        self.assertNotIn("PR の解説]", PR_WORKFLOW_SOURCE)


@unittest.skipUnless(NODE, "Node.js がないため公開コメントの実行は未実施")
class PrExplainPublishedComments(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.context = {"repo": {"owner": "DIO0550", "repo": "pdfmod"}, "serverUrl": "https://github.com", "runId": 1234}
        self.prs = {"1": self.pr()}
        self.comments = {}
        self.errors = {}
        self.page_url = "https://pages.example.test/seasonings/"
        self.write_page(1)

    def pr(self, *, sha=SHA, state="open", repository="DIO0550/pdfmod", author="DIO0550"):
        return {"state": state, "head": {"sha": sha, "repo": {"full_name": repository}}, "user": {"login": author}}

    def write_page(self, number, *, data=None, raw=None, index=True):
        folder = self.root / "site/pr-explain" / f"pr-{number}"
        folder.mkdir(parents=True, exist_ok=True)
        if index:
            (folder / "index.html").write_text("<p>公開済み</p>", encoding="utf-8")
        if raw is None:
            if data is None:
                data = {"version": 2, "pr": number, "head": SHA}
            raw = json.dumps(data)
        (folder / "change-map.json").write_text(raw, encoding="utf-8")
        return folder

    def execute(self, *, script=SCRIPT, comment_error=None):
        payload = {"script": script, "context": self.context, "prs": self.prs, "comments": self.comments, "errors": self.errors, "commentError": comment_error}
        return subprocess.run([NODE, "-e", RUNNER], cwd=self.root, env={**os.environ, "PR_EXPLAIN_PAGE_URL": self.page_url}, input=json.dumps(payload), text=True, capture_output=True)

    def operations(self, *, script=SCRIPT):
        result = self.execute(script=script)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def mutations(self, operations):
        return [call for call in operations if call["operation"] in ("create", "update")]

    def test_create_uses_actual_deployment_url_sha_and_ci_run(self):
        mutations = self.mutations(self.operations())
        self.assertEqual(len(mutations), 1)
        created = mutations[0]
        self.assertEqual((created["operation"], created["issue_number"]), ("create", 1))
        self.assertTrue(created["body"].startswith(MARKER))
        self.assertIn("https://pages.example.test/seasonings/pr-explain/pr-1/", created["body"])
        self.assertIn(SHA, created["body"])
        self.assertIn("https://github.com/DIO0550/pdfmod/actions/runs/1234", created["body"])
        self.assertNotIn("dio0550.github.io", created["body"])
        self.page_url = "https://other.example.test/custom"
        self.assertIn("https://other.example.test/custom/pr-explain/pr-1/", self.mutations(self.operations())[0]["body"])

    def test_update_bot_comment_keeps_other_comments_and_repeated_body_is_unchanged(self):
        self.comments["1"] = [
            {"id": 4, "user": {"login": "DIO0550"}, "body": MARKER + "\n人のメモ"},
            {"id": 5, "user": {"login": "github-actions[bot]"}, "body": "別の自動コメント"},
            {"id": 6, "user": {"login": "github-actions[bot]"}, "body": MARKER + "\n古いURL"},
        ]
        changed = self.mutations(self.operations())
        self.assertEqual([(call["operation"], call["comment_id"]) for call in changed], [("update", 6)])
        self.comments["1"][2]["body"] = changed[0]["body"]
        self.assertEqual(self.mutations(self.operations()), [])

    def test_stale_closed_fork_and_dependabot_prs_do_not_get_links(self):
        for pr in (self.pr(sha="b" * 40), self.pr(state="closed"), self.pr(repository="someone/fork"), self.pr(author="dependabot[bot]")):
            with self.subTest(pr=pr):
                self.prs["1"] = pr
                operations = self.operations()
                self.assertEqual(self.mutations(operations), [])
                self.assertEqual([call["operation"] for call in operations], ["get"])

    def test_invalid_json_metadata_and_missing_index_are_skipped_before_api(self):
        invalid = ["{", "null", "[]"]
        for data in (
            {"version": 1, "pr": 1, "head": SHA},
            {"version": 2, "pr": 2, "head": SHA},
            {"version": 2, "pr": "1", "head": SHA},
            {"version": 2, "pr": 1, "head": "A" * 40},
            {"version": 2, "pr": 1, "head": "a" * 39},
            {"version": 2, "pr": 1, "head": SHA + "\n"},
            {"version": 2, "pr": 1, "head": 123},
        ):
            invalid.append(json.dumps(data))
        for raw in invalid:
            with self.subTest(raw=raw):
                self.write_page(1, raw=raw)
                self.assertEqual(self.operations(), [])
        folder = self.write_page(1)
        (folder / "index.html").unlink()
        self.assertEqual(self.operations(), [])
        (folder / "index.html").mkdir()
        self.assertEqual(self.operations(), [])
        (folder / "index.html").rmdir()
        self.write_page(1)
        (folder / "change-map.json").unlink()
        self.assertEqual(self.operations(), [])

    def test_missing_site_folder_and_invalid_directory_numbers_are_noops(self):
        shutil.rmtree(self.root / "site/pr-explain")
        self.assertEqual(self.operations(), [])
        for name, number in (("0", 0), ("01", 1), ("-1", -1), ("9007199254740992", 9007199254740992), ("1-extra", 1), ("1\n", 1)):
            self.write_page(name, data={"version": 2, "pr": number, "head": SHA})
        self.assertEqual(self.operations(), [])

    def test_nonexistent_pr_is_skipped_but_permission_or_comment_failure_is_not_hidden(self):
        self.errors["1"] = 404
        self.assertEqual(self.mutations(self.operations()), [])
        self.errors["1"] = 403
        result = self.execute()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("GitHub status 403", result.stderr)
        self.errors.clear()
        result = self.execute(comment_error=500)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("GitHub status 500", result.stderr)

    def test_each_published_pr_is_independent_and_only_current_one_changes(self):
        self.write_page(2)
        self.prs["2"] = self.pr(sha="b" * 40)
        self.comments["2"] = [{"id": 20, "user": {"login": "github-actions[bot]"}, "body": MARKER + "\n保持するコメント"}]
        self.assertEqual([(call["operation"], call["issue_number"]) for call in self.mutations(self.operations())], [("create", 1)])
        self.prs["2"] = self.pr()
        self.assertEqual({(call["operation"], call.get("issue_number"), call.get("comment_id")) for call in self.mutations(self.operations())}, {("create", 1, None), ("update", None, 20)})

    def test_published_html_and_json_strings_are_data_and_never_executed(self):
        payload = "require('node:fs').writeFileSync('executed', 'bad')"
        folder = self.write_page(1, data={"version": 2, "pr": 1, "head": SHA, "payload": payload})
        (folder / "index.html").write_text(f"<script>{payload}</script>", encoding="utf-8")
        (folder / "payload.js").write_text(payload, encoding="utf-8")
        self.assertEqual(len(self.mutations(self.operations())), 1)
        self.assertFalse((self.root / "executed").exists())

    def test_close_only_updates_existing_comment_and_ignores_reopened_pr(self):
        self.context["payload"] = {"pull_request": {"number": 1, "head": {"sha": SHA}}}
        self.prs["1"] = self.pr(state="closed")
        self.assertEqual(self.mutations(self.operations(script=CLOSE_SCRIPT)), [])
        self.comments["1"] = [{"id": 6, "user": {"login": "github-actions[bot]"}, "body": MARKER + "\n公開URL"}]
        changed = self.mutations(self.operations(script=CLOSE_SCRIPT))
        self.assertEqual([(call["operation"], call["comment_id"]) for call in changed], [("update", 6)])
        self.assertNotIn("https:", changed[0]["body"])
        self.prs["1"] = self.pr()
        self.assertEqual(self.mutations(self.operations(script=CLOSE_SCRIPT)), [])


if __name__ == "__main__":
    unittest.main()
