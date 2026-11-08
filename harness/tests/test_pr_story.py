"""変更の経緯の説明を、実Git差分と公開用入力で検査する。"""

from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
import unittest

from test_pr_explain import SCRIPTS, run


@contextmanager
def story_fixture():
    """離れた2か所の変更・追加・削除・後続コミットを持つ地図と解説を作る。"""
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        repo = folder / "repo"
        repo.mkdir()
        run("git", "init", "-q", "-b", "main", cwd=repo).check_returncode()
        run("git", "config", "user.name", "story-tests", cwd=repo).check_returncode()
        run("git", "config", "user.email", "story-tests@example.com", cwd=repo).check_returncode()
        middle = "".join(f"const unchanged{i} = {i};\n" for i in range(20))
        first = "export function first() { return 1; }\n"
        second = "export function second() { return 2; }\n"
        (repo / "a.ts").write_text(first + middle + second)
        (repo / "removed.ts").write_text("export const legacy = true;\n")
        (repo / "before.txt").write_text("same content\n")
        (repo / "image.bin").write_bytes(b"\x00before")
        (repo / "removed.bin").write_bytes(b"\x00legacy")
        (repo / "blank.txt").write_text(" \n")
        run("git", "add", ".", cwd=repo).check_returncode()
        run("git", "commit", "-qm", "base", cwd=repo).check_returncode()
        base = run("git", "rev-parse", "HEAD", cwd=repo).stdout.strip()
        (repo / "a.ts").write_text(first.replace("return 1", "return 3") + middle + second.replace("return 2", "return 4"))
        (repo / "b.ts").write_text("export const enabled = true;\n")
        (repo / "removed.ts").unlink()
        (repo / "before.txt").rename(repo / "after.txt")
        (repo / "image.bin").write_bytes(b"\x00after")
        (repo / "removed.bin").unlink()
        (repo / "blank.txt").write_text("\n")
        run("git", "add", ".", cwd=repo).check_returncode()
        run("git", "commit", "-qm", "change processing", cwd=repo).check_returncode()
        first_sha = run("git", "rev-parse", "HEAD", cwd=repo).stdout.strip()
        (repo / "b.ts").write_text("export const enabled = false;\n")
        run("git", "add", ".", cwd=repo).check_returncode()
        run("git", "commit", "-qm", "disable", cwd=repo).check_returncode()
        head = run("git", "rev-parse", "HEAD", cwd=repo).stdout.strip()
        built = run("python3", str(SCRIPTS / "build-pr-change-map.py"), "--base", base, "--head", head, "--pr", "123", "--head-branch", "topic", "--base-branch", "main", cwd=repo)
        if built.returncode:
            raise AssertionError(built.stderr)
        notes = [
            {"path": "a.ts", "start": 1, "end": 1, "text": "先頭の処理が返す値を1から3へ変え、選択結果を切り替える。"},
            {"path": "a.ts", "side": "old", "start": 22, "end": 22, "text": "末尾の処理の旧値2を削除し、新しい値4へ置き換える。"},
            {"path": "b.ts", "start": 1, "end": 1, "text": "利用可否の初期値を追加し、呼び出し側が機能を選択できるようにする。"},
            {"path": "removed.ts", "side": "old", "start": 1, "end": 1, "text": "旧フラグをファイルごと取り除き、二重の設定をなくす。"},
            {"path": "after.txt", "start": 1, "end": 1, "text": "内容を保ったままファイル名を変更し、新しい参照先へ合わせる。"},
            {"path": "image.bin", "start": 1, "end": 1, "text": "画像データを更新し、新しい表示内容に差し替える。"},
            {"path": "removed.bin", "side": "old", "start": 1, "end": 1, "text": "使用しなくなった画像データを取り除く。"},
            {"path": "blank.txt", "start": 1, "end": 1, "text": "空行の空白文字を除去し、出力形式をそろえる。"},
        ]
        explanation = {"version": 1, "pr": 123, "sha": head, "commitStories": [
            {"sha": first_sha, "role": "返す値と利用可否を変更", "why": "新しい選択結果へ合わせるため。", "notes": notes},
            {"sha": head, "role": "機能の初期状態を無効化", "why": "明示的に選択した場合だけ使うため。", "notes": [{"path": "b.ts", "start": 1, "end": 1, "text": "既定のtrueをfalseへ変え、自動的な機能の有効化を止める。"}]},
        ]}
        yield folder, json.loads(built.stdout), explanation


def check_story(folder, change_map, explanation):
    """公開用JSONをCLIへ渡し、入力の検査結果を返す。"""
    source = folder / "explain.json"
    source.write_text(json.dumps(explanation, ensure_ascii=False))
    map_file = folder / "change-map.json"
    map_file.write_text(json.dumps(change_map, ensure_ascii=False))
    return run("python3", str(SCRIPTS / "check-pr-story.py"), str(source), str(map_file))


class PrStoryTests(unittest.TestCase):
    def test_accepts_explanations_for_each_commit_hunk_added_and_deleted_file(self):
        with story_fixture() as (folder, change_map, explanation):
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_a_missing_commit_story(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"].pop()
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("commitStories", result.stdout)
            self.assertIn(change_map["head"][:7], result.stdout)

    def test_rejects_a_missing_file_explanation(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"] = [note for note in explanation["commitStories"][0]["notes"] if note["path"] != "b.ts"]
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("b.ts", result.stdout)
            self.assertIn("注釈", result.stdout)

    def test_rejects_an_unexplained_hunk_even_when_the_same_file_has_another_note(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"].pop(1)
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("a.ts", result.stdout)
            self.assertIn("@@", result.stdout)

    def test_rejects_a_note_only_on_unchanged_context(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"][0].update(start=2, end=2)
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("変更行", result.stdout)

    def test_one_wide_note_does_not_explain_two_separately_displayed_hunks(self):
        with story_fixture() as (folder, change_map, explanation):
            notes = explanation["commitStories"][0]["notes"]
            notes[0]["end"] = 22
            notes.pop(1)
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("@@ -19,4 +19,4 @@", result.stdout)

    def test_rejects_a_note_for_a_file_outside_the_commit(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"][0]["path"] = "other.ts"
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("other.ts", result.stdout)

    def test_rejects_a_whitespace_only_explanation(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"][0]["text"] = " \n\t"
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("空白", result.stdout)

    def test_rejects_an_annotation_range_that_bundles_too_much_code(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"][0].update(start=1, end=81)
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("80", result.stdout)

    def test_stale_explanation_checks_only_commits_at_its_own_snapshot(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["sha"] = explanation["commitStories"][0]["sha"]
            explanation["commitStories"].pop()
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_a_deleted_file_note_on_the_new_side(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["commitStories"][0]["notes"][3]["side"] = "new"
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("変更前", result.stdout)

    def test_rejects_an_explanation_for_a_commit_outside_the_map(self):
        with story_fixture() as (folder, change_map, explanation):
            explanation["sha"] = "0" * 40
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("sha", result.stdout)

    def test_rejects_an_incomplete_map_without_a_traceback(self):
        with story_fixture() as (folder, change_map, explanation):
            del change_map["commits"]
            result = check_story(folder, change_map, explanation)
            self.assertEqual(result.returncode, 1)
            self.assertIn("commits", result.stdout)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
