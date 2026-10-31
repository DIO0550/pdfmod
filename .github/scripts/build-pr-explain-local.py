#!/usr/bin/env python3
"""信頼するローカルのスクリプトで、リポジトリ外へ PR 解説の 3 ファイルを生成する。"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("base", "head", "head-branch", "base-branch"):
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--pr", required=True, type=int)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--explain", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = args.out.resolve()
    if args.pr < 1 or output == root or root in output.parents or output in root.parents:
        parser.error("PR は正の整数、出力先はリポジトリの外(親フォルダも不可)にする")
    scripts = Path(__file__).resolve().parent
    template = root / ".github/pr-explain/templates/index.html"
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    with tempfile.TemporaryDirectory(prefix="pdfmod-pr-explain-") as work:
        work = Path(work)
        checks = [["python3", str(scripts / "check-pr-explain-template.py"), str(template)]]
        if args.explain:
            checks.append(["python3", str(scripts / "build-pr-explain.py"), str(args.explain.resolve()), "--pr", str(args.pr), "--out", str(work / "explain.json"), "--repo", str(root)])
        for command in checks:
            result = subprocess.run(command, cwd=root, env=env)
            if result.returncode:
                return result.returncode
        command = ["python3", str(scripts / "build-pr-change-map.py"), "--base", args.base, "--head", args.head, "--pr", str(args.pr), "--head-branch", args.head_branch, "--base-branch", args.base_branch]
        with (work / "change-map.json").open("w", encoding="utf-8") as stream:
            result = subprocess.run(command, cwd=root, env=env, stdout=stream)
        if result.returncode:
            return result.returncode
        output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template, output / "index.html")
        shutil.copyfile(work / "change-map.json", output / "change-map.json")
        if args.explain:
            shutil.copyfile(work / "explain.json", output / "explain.json")
        else:
            (output / "explain.json").unlink(missing_ok=True)
    print(f"生成しました: {output}\npython3 -m http.server 8000 --directory {output}\nhttp://localhost:8000/#map")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
