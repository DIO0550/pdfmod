#!/usr/bin/env bash
#
# 解説ページの置き場の判定表。ローカルの bare リポジトリを gh-pages の置き場にして
# `pr-explain-pages.sh` を走らせ、push された後の gh-pages が期待どおりかを 1 コマンドで確かめる。
#
# 使い方: bash .github/scripts/pr-explain-pages-cases.sh
# 出力が `ok` だけなら期待どおり。`NG` が 1 行でも出たら判定が変わっている。
#
# **他の PR のフォルダ・`pr-preview/` に触らないことを、どのモードでも見る。** gh-pages は
# Storybook と VRT の配信と同じブランチで、ここを壊すとこの機能の外まで消える。
# `remove 1` が `pr-12` を消さないのは、作業コピーに展開するのが `pr-explain/pr-1/` だけ
# (sparse-checkout)だから。消す側を `pr-1*` の前方一致に取り違えても、展開の範囲を
# `pr-explain/` 全体へ広げない限りこのケースは通る。見ているのは 2 つが組み合わさった結果。
#
# 競合の再試行は、bare リポジトリの pre-receive フックで 1 回目の push だけを拒否して作る。
# 待ち時間は `PR_EXPLAIN_RETRY_WAIT=0` で消す。
#
# 解説の sha と抜粋は、スクリプトが置かれたリポジトリ(セッションの作業コピー)から読む。外側の
# リポジトリの HEAD は push 前の検査のときにまだリモートに無いので、スクリプトを一時リポジトリへ写し、
# push 済みのコミットと push していないコミットを作って使う。
set -uo pipefail

scripts_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$scripts_dir/../.." && pwd)"
template="$repo_root/.github/pr-explain/templates/index.html"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
export PR_EXPLAIN_REMOTE="file://$work/origin.git"
export PR_EXPLAIN_RETRY_WAIT=0
export GIT_AUTHOR_NAME=cases GIT_AUTHOR_EMAIL=cases@example.com
export GIT_COMMITTER_NAME=cases GIT_COMMITTER_EMAIL=cases@example.com

source "$repo_root/.github/scripts/lib/cases-report.sh"

# セッションの作業コピー。`head` は追跡ブランチ(origin/topic)にあり、`unpushed` は無い。
session="$work/session"
git init --quiet -b topic "$session"
mkdir -p "$session/.github/scripts/lib"
cp "$scripts_dir/pr-explain-pages.sh" "$scripts_dir/build-pr-explain.py" "$scripts_dir/check-pr-explain-template.py" "$session/.github/scripts/"
cp "$scripts_dir/lib/embedded_regions.py" "$session/.github/scripts/lib/"
printf '{"name": "session"}\n' > "$session/package.json"
git -C "$session" add -A && git -C "$session" commit --quiet -m pushed
git init --quiet --bare "$work/session-origin.git"
git -C "$session" remote add origin "file://$work/session-origin.git"
git -C "$session" push --quiet origin topic 2>/dev/null
head="$(git -C "$session" rev-parse HEAD)"
echo local > "$session/local.txt"
git -C "$session" add -A && git -C "$session" commit --quiet -m unpushed
unpushed="$(git -C "$session" rev-parse HEAD)"
pages="$session/.github/scripts/pr-explain-pages.sh"

# 解説として通るもの(PR #1 宛て・push 済みのコミット時点)と、検査に落ちるもの。抜粋は
# 検査が中身を足すので、置かれたものが検査の書き出しかどうかが `text` の有無で分かる。
python3 - "$work" "$head" "$unpushed" <<'PY'
import json, sys
work, head, unpushed = sys.argv[1:4]
explain = {
    "version": 1, "pr": 1, "sha": head,
    "overview": {"title": "書いた解説", "lead": "要約", "before": [], "after": [{"text": "後"}]},
    "suites": [{"id": "s", "label": "置き場", "file": "package.json"}],
    "tests": [{"id": "t", "suite": "s", "name": "n", "techniques": ["state"], "why": "w", "given": "g", "when": "w", "then": "t",
               "excerpt": {"path": "package.json", "start": 1, "end": 1}}],
}
write = lambda name, value: open(f"{work}/{name}", "w", encoding="utf-8").write(json.dumps(value, ensure_ascii=False))
write("explain.json", explain)
write("broken.json", {**explain, "version": 2})
write("explain-7.json", {**explain, "pr": 7})
write("explain-2.json", {**explain, "pr": 2})
write("unpushed.json", {**explain, "sha": unpushed})
write("map.json", {"version": 2, "head": "new"})
PY
broken_template="$work/broken-template.html"
sed 's/<script>/<script> /' "$template" > "$broken_template"

# gh-pages を持つ bare リポジトリを作り直す。
# $1 `seeded` なら既存の PR のフォルダと pr-preview を置く。`empty` なら gh-pages を作らない
fresh_origin() {
  rm -rf "$work/origin.git" "$work/seed" "$work/pushes"
  git init --quiet --bare "$work/origin.git"
  git -C "$work/origin.git" config uploadpack.allowFilter true
  [ "$1" = "seeded" ] || return 0
  git init --quiet -b gh-pages "$work/seed"
  mkdir -p "$work/seed/pr-explain/pr-1" "$work/seed/pr-explain/pr-12" "$work/seed/pr-preview/pr-1"
  echo old > "$work/seed/pr-explain/pr-1/index.html"
  printf '{"version": 2, "head": "%s"}\n' "$head" > "$work/seed/pr-explain/pr-1/change-map.json"
  echo '{"old": "explain"}' > "$work/seed/pr-explain/pr-1/explain.json"
  echo behavior > "$work/seed/pr-explain/pr-1/behavior.html"
  mkdir -p "$work/seed/pr-explain/pr-1/assets"
  echo asset > "$work/seed/pr-explain/pr-1/assets/x.css"
  mkdir -p "$work/seed/pr-explain/pr-2"
  echo '{"version": 2, "head": "0000000"}' > "$work/seed/pr-explain/pr-2/change-map.json"
  echo twelve > "$work/seed/pr-explain/pr-12/index.html"
  echo '{"head": "twelve"}' > "$work/seed/pr-explain/pr-12/change-map.json"
  echo storybook > "$work/seed/pr-preview/pr-1/index.html"
  touch "$work/seed/.nojekyll"
  git -C "$work/seed" add -A && git -C "$work/seed" commit --quiet -m seed
  git -C "$work/seed" push --quiet "$work/origin.git" gh-pages 2>/dev/null
}

# 1 回目の push だけを拒否する pre-receive フックを置く。
reject_first_push() {
  cat > "$work/origin.git/hooks/pre-receive" <<HOOK
#!/usr/bin/env bash
count=\$(( \$(cat "$work/pushes" 2>/dev/null || echo 0) + 1 ))
echo "\$count" > "$work/pushes"
[ "\$count" -gt 1 ]
HOOK
  chmod +x "$work/origin.git/hooks/pre-receive"
}

# gh-pages 上のファイルの中身。無ければ `<none>`。
on_pages() {
  git --git-dir="$work/origin.git" show "gh-pages:$1" 2>/dev/null || echo "<none>"
}

# gh-pages 上のファイルが文字列を含むか。`grep -q` にしないのは、見つけた時点で読むのをやめ、
# 書き終わっていない `git show` が SIGPIPE で落ちて pipefail で偽になるため(ページが大きいと時々落ちる)。
page_has() {
  on_pages "$1" | grep -F "$2" >/dev/null
}

tip() {
  git --git-dir="$work/origin.git" rev-parse --verify --quiet gh-pages || echo "<none>"
}

# 表明が成り立つかを 1 行で報告する。
# $1 ケース名, $2 表明(bash の条件。成り立てば holds)
expect() {
  if eval "$2"; then outcome=holds; else outcome=fails; fi
  report holds "$outcome" "$1"
}

run_pages() {
  bash "$pages" "$@" >/dev/null 2>&1
}

# 置いた explain.json が、検査の書き出し(抜粋に text がある)か。
placed_by_builder() {
  on_pages pr-explain/pr-1/explain.json | python3 -c 'import json, sys; e = json.load(sys.stdin); sys.exit(0 if e["overview"]["title"] == "書いた解説" and "text" in e["tests"][0]["excerpt"] else 1)'
}

fresh_origin seeded
errors="$(bash "$pages" put-explain 1 "$work/explain.json" 2>&1 >/dev/null)"; status=$?
expect "put-explain は explain.json を置き、index.html と change-map.json に触らない" '[ "$status" -eq 0 ] && placed_by_builder && [ "$(on_pages pr-explain/pr-1/index.html)" = old ] && [ "$(on_pages pr-explain/pr-1/change-map.json)" = "{\"version\": 2, \"head\": \"$head\"}" ]'
expect "put-explain が置くのは、検査が抜粋の中身を足して書き出したもの" 'placed_by_builder'
expect "put-explain は他の PR のフォルダに触らない" '[ "$(on_pages pr-explain/pr-12/index.html)" = twelve ]'
expect "put-explain は pr-preview に触らない" '[ "$(on_pages pr-preview/pr-1/index.html)" = storybook ]'

fresh_origin seeded
stale_errors="$(bash "$pages" put-explain 2 "$work/explain-2.json" 2>&1 >/dev/null)"; stale_status=$?
expect "解説の sha が地図の head と違えば、置いたうえで標準エラーに知らせる(同じなら知らせない)" '[ "$stale_status" -eq 0 ] && [[ "$stale_errors" == *"地図の head"* ]] && [[ "$errors" != *"地図の head"* ]]'

fresh_origin seeded
before="$(tip)"
output="$(bash "$pages" put-explain 1 "$work/broken.json" 2>&1)"; status=$?
expect "検査に落ちる解説は、取り直しへ進まずに push しない" '[ "$status" -eq 1 ] && [ "$(tip)" = "$before" ] && [[ "$output" == *"[pr-explain-shape]"* ]] && [[ "$output" != *"反映に失敗"* ]]'

fresh_origin seeded
before="$(tip)"
output="$(bash "$pages" put-explain 1 "$work/unpushed.json" 2>&1)"; status=$?
expect "解説の sha がリモートの追跡ブランチに無ければ、検査を通っても置かずに 1" '[ "$status" -eq 1 ] && [ "$(tip)" = "$before" ] && [[ "$output" == *"追跡ブランチ"* ]] && [[ "$output" != *"[pr-explain-"* ]]'

fresh_origin seeded
before="$(tip)"
run_pages put-explain 7 "$work/explain-7.json"; status=$?
expect "地図の無いフォルダへは put-explain しない" '[ "$status" -eq 3 ] && [ "$(tip)" = "$before" ] && [ "$(on_pages pr-explain/pr-7/explain.json)" = "<none>" ]'

fresh_origin seeded
before="$(tip)"
run_pages put-explain 1; status=$?
expect "put-explain に解説が無ければ引数の誤り" '[ "$status" -eq 2 ] && [ "$(tip)" = "$before" ]'

fresh_origin seeded
before="$(tip)"
run_pages put-page 1 index "$work/explain.json"; status=$?
expect "put-page は知らないモード(引数の誤り)" '[ "$status" -eq 2 ] && [ "$(tip)" = "$before" ]'

fresh_origin seeded
run_pages put-map 1 "$work/map.json" "$template"
expect "put-map は index.html を毎回テンプレートで上書きする" '[ "$(on_pages pr-explain/pr-1/index.html)" = "$(cat "$template")" ]'
expect "put-map は explain.json を残す" '[ "$(on_pages pr-explain/pr-1/explain.json)" = "{\"old\": \"explain\"}" ]'
expect "put-map は 3 ファイル以外(ほかのファイル・サブフォルダ)を消す" '[ "$(on_pages pr-explain/pr-1/behavior.html)" = "<none>" ] && [ "$(on_pages pr-explain/pr-1/assets/x.css)" = "<none>" ]'
expect "put-map は change-map.json を更新する" '[ "$(on_pages pr-explain/pr-1/change-map.json)" = "$(cat "$work/map.json")" ]'
expect "put-map は他の PR のフォルダに触らない" '[ "$(on_pages pr-explain/pr-12/index.html)" = twelve ]'
expect "put-map は pr-preview に触らない" '[ "$(on_pages pr-preview/pr-1/index.html)" = storybook ]'

fresh_origin seeded
run_pages put-map 5 "$work/map.json" "$template"
expect "put-map は新しいフォルダにテンプレートを置く" '[ "$(on_pages pr-explain/pr-5/index.html)" = "$(cat "$template")" ]'
expect "put-map は新しいフォルダに change-map.json を置く" '[ "$(on_pages pr-explain/pr-5/change-map.json)" = "$(cat "$work/map.json")" ]'

fresh_origin seeded
before="$(tip)"
output="$(bash "$pages" put-map 1 "$work/map.json" "$broken_template" 2>&1)"; status=$?
expect "CSP の合わないテンプレートの put-map は 1 で、push しない" '[ "$status" -eq 1 ] && [ "$(tip)" = "$before" ] && [[ "$output" == *"[pr-explain-csp]"* ]]'

fresh_origin seeded
run_pages remove 1
expect "remove はその PR のフォルダを消す" '[ "$(on_pages pr-explain/pr-1/index.html)" = "<none>" ]'
expect "remove 1 は pr-12 を消さない" '[ "$(on_pages pr-explain/pr-12/index.html)" = twelve ]'
expect "remove は pr-preview に触らない" '[ "$(on_pages pr-preview/pr-1/index.html)" = storybook ]'

fresh_origin seeded
before="$(tip)"
run_pages remove 99; status=$?
expect "消すフォルダが無い remove は変更なしで終わる" '[ "$status" -eq 0 ] && [ "$(tip)" = "$before" ]'

fresh_origin seeded
before="$(tip)"
run_pages remove '1 ../..'; status=$?
expect "数字でない PR 番号は拒否する" '[ "$status" -eq 2 ] && [ "$(tip)" = "$before" ]'

fresh_origin seeded
reject_first_push
run_pages put-map 1 "$work/map.json" "$template"; status=$?
expect "1 回目の push が拒否されても取り直して通る" '[ "$status" -eq 0 ] && [ "$(cat "$work/pushes")" = 2 ] && [ "$(on_pages pr-explain/pr-1/change-map.json)" = "$(cat "$work/map.json")" ]'

fresh_origin empty
run_pages put-map 3 "$work/map.json" "$template"; status=$?
expect "gh-pages が無ければ orphan で作る" '[ "$status" -eq 0 ] && [ "$(on_pages pr-explain/pr-3/change-map.json)" = "$(cat "$work/map.json")" ] && [ "$(on_pages .nojekyll)" = "" ]'

fresh_origin empty
run_pages remove 3; status=$?
expect "gh-pages が無いときの remove は何も作らない" '[ "$status" -eq 0 ] && [ "$(tip)" = "<none>" ]'

exit "$cases_failed"
