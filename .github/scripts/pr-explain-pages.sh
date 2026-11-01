#!/usr/bin/env bash
#
# gh-pages の `pr-explain/pr-<番号>/`(PR の解説ページ)を書き換える。
#
# 使い方:
#   pr-explain-pages.sh put-explain <PR 番号> <explain.json>                 … 解説を検査して置く(セッションが呼ぶ)
#   pr-explain-pages.sh put-map     <PR 番号> <change-map.json> <テンプレート>  … 枠と変更の地図を置く(Actions が呼ぶ)
#   pr-explain-pages.sh remove      <PR 番号>                                … フォルダごと消す(PR が閉じたとき)
#
# フォルダに置くのは `index.html`(枠)・`change-map.json`(地図)・`explain.json`(解説)の 3 つだけ。
#
# - `put-explain` は `build-pr-explain.py` が検査して書き出したもの(抜粋の中身を足したもの)を
#   `explain.json` として置く。違反があれば push しない。触るのはこの 1 ファイルだけ
# - `put-explain` は、解説の sha がリモートの追跡ブランチ(`git branch -r --contains`)に無ければ置かない。
#   抜粋はその sha の中身から読むので、push していないコミットの中身を公開しないため
# - `put-explain` は `change-map.json` が無いフォルダへは置かない。Actions が作る前と、PR が閉じて
#   消した後に、セッションがフォルダを復活させないため。解説の sha が地図の head と違えば、置いた
#   うえで標準エラーに知らせる(古い解説も、ページが解説の時点を帯で出すので読める)
# - `put-map` は clone の前に `check-pr-explain-template.py` で枠を検査し、`index.html` を毎回
#   上書きする。枠の変わったコミット(main の取り込みを含む)が、次の push でそのままページに効くように。
#   フォルダには 3 つだけを置く、という形を保つため、それ以外のファイルは消す
#
# gh-pages に他の公開物が増えても必要な範囲だけ取るため、blob を取らない
# 浅い clone から `pr-explain/pr-<番号>/` だけを展開する。他のワークフローとの push の競合は、
# 取り直しからやり直して吸収する(最大 5 回)。
#
# 環境変数:
#   PR_EXPLAIN_REMOTE      push 先(既定はこのリポジトリの origin)
#   PR_EXPLAIN_RETRY_WAIT  n 回目の失敗の後に n × この秒数だけ待つ(既定 2)
#
# 終了コード: 0 = 置いた / 変更が無かった、1 = 解説か枠が検査に落ちた・解説の sha を push していない・
#             push できなかった、2 = 引数の誤り(知らないモードを含む)、3 = `put-explain` の置き先に地図が
#             無い(`PR Explain` の run が地図を置く前か、PR が閉じて消した後。やり直さない)
set -uo pipefail

scripts_dir="$(cd "$(dirname "$0")" && pwd)"
branch="gh-pages"
max_attempts=5
retry_wait="${PR_EXPLAIN_RETRY_WAIT:-2}"

usage() {
  sed -n '/^# 使い方:/,/^#$/p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

mode="${1:-}"
pr="${2:-}"
[[ "$pr" =~ ^[1-9][0-9]*$ ]] || usage
case "$mode" in
  put-explain) args_ok=$([ $# -eq 3 ] && [ -f "$3" ] && echo yes) ;;
  put-map) args_ok=$([ $# -eq 4 ] && [ -f "$3" ] && [ -f "$4" ] && echo yes) ;;
  remove) args_ok=$([ $# -eq 2 ] && echo yes) ;;
  *) args_ok="" ;;
esac
[ "$args_ok" = yes ] || usage

remote="${PR_EXPLAIN_REMOTE:-$(git -C "$scripts_dir" remote get-url origin)}"
folder="pr-explain/pr-$pr"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# 解説の sha が、リモートの追跡ブランチのどれかに入っているか。
# $1 解説を書き出したファイル
is_pushed_explain() {
  local sha
  sha="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["sha"])' "$1")" || return 1
  [ -n "$(git -C "$scripts_dir" branch -r --contains "$sha" 2>/dev/null)" ]
}

# 検査は clone の前に済ませる。落ちたものを置かないのと、取り直しのたびに同じ検査を繰り返さないため。
# 解説の sha と抜粋は、このスクリプトがあるリポジトリ(セッションの作業コピー)から読む。
case "$mode" in
  put-explain)
    python3 "$scripts_dir/build-pr-explain.py" "$3" --pr "$pr" --out "$work/explain.json" --repo "$scripts_dir" || exit $?
    is_pushed_explain "$work/explain.json" || { echo "解説の sha がリモートの追跡ブランチにありません(push・fetch してから置きます)" >&2; exit 1; }
    ;;
  put-map) python3 "$scripts_dir/check-pr-explain-template.py" "$4" || exit $? ;;
esac

# gh-pages の有無。0 = ある、2 = 無い、それ以外 = 問い合わせに失敗した。
# 失敗の理由(認証・名前解決)を読めるよう、標準エラーは捨てない。
pages_branch_state() {
  git ls-remote --exit-code --heads "$remote" "$branch" >/dev/null
}

# gh-pages を取り、`$folder` だけを展開した作業コピーを `$work/site` に作る。
# gh-pages がまだ無ければ空の orphan を作る(既存のワークフローと同じ扱い)。
checkout_site() {
  rm -rf "$work/site"
  pages_branch_state
  case $? in
    0) ;;
    2)
      git init --quiet "$work/site" &&
        git -C "$work/site" checkout --quiet --orphan "$branch" &&
        git -C "$work/site" remote add origin "$remote" &&
        touch "$work/site/.nojekyll" &&
        git -C "$work/site" add .nojekyll
      return
      ;;
    *) return 1 ;;
  esac
  git clone --quiet --filter=blob:none --no-checkout --depth 1 --branch "$branch" --single-branch \
    "$remote" "$work/site" &&
    git -C "$work/site" sparse-checkout set --no-cone "/$folder/" &&
    git -C "$work/site" checkout --quiet "$branch"
}

# `$folder` の中の、置くと決めた 3 つ以外のファイルを作業コピーから消す(サブフォルダの中も)。
# 消した分は `commit_and_push` の `git add -A` が拾う。
# $1 作業コピー
remove_others() {
  local path
  git -C "$1" ls-files -z -- "$folder" | while IFS= read -r -d '' path; do
    case "$path" in
      "$folder/index.html" | "$folder/change-map.json" | "$folder/explain.json") ;;
      *) rm -f -- "$1/$path" ;;
    esac
  done
}

# モードごとに `$folder` を書き換える。返す 3 は先頭の終了コードの 3 と同じ。
apply_change() {
  local site="$work/site"
  case "$mode" in
    put-explain)
      [ -f "$site/$folder/change-map.json" ] || return 3
      cp "$work/explain.json" "$site/$folder/explain.json"
      ;;
    put-map)
      mkdir -p "$site/$folder"
      cp "$3" "$site/$folder/change-map.json"
      cp "$4" "$site/$folder/index.html"
      remove_others "$site"
      ;;
    remove)
      git -C "$site" rm -r --quiet --ignore-unmatch -- "$folder"
      ;;
  esac
}

# 変更をコミットして push し、結果を 1 行出す。変更が無ければ push しない。
commit_and_push() {
  local site="$work/site"
  # `remove` は `git rm` で index まで反映済みで、消したフォルダを add すると pathspec が当たらず落ちる。
  if [ -e "$site/$folder" ]; then
    git -C "$site" add -A -- "$folder" || return 1
  fi
  if git -C "$site" diff --cached --quiet; then
    echo "$folder: 変更なし"
    return 0
  fi
  git -C "$site" config user.name >/dev/null || git -C "$site" config user.name "github-actions[bot]"
  git -C "$site" config user.email >/dev/null || git -C "$site" config user.email "github-actions[bot]@users.noreply.github.com"
  git -C "$site" commit --quiet -m "PR explain #$pr ($mode)" &&
    git -C "$site" push --quiet origin "HEAD:$branch" &&
    echo "$folder: $mode を反映しました"
}

# `put-explain` で置いた解説の sha が地図の head と違えば、標準エラーに知らせる。置くのは止めない。
notify_stale() {
  [ "$mode" = "put-explain" ] || return 0
  python3 - "$work/explain.json" "$work/site/$folder/change-map.json" <<'PY'
import json, sys
explained = json.load(open(sys.argv[1], encoding="utf-8"))["sha"]
head = json.load(open(sys.argv[2], encoding="utf-8")).get("head")
if explained != head:
    print(f"解説の sha {explained[:7]} は地図の head {str(head)[:7]} と違います(置きました。ページは解説がどの時点のものかを帯で出します)", file=sys.stderr)
PY
  return 0
}

# 消すものが無い。gh-pages を作ってまで空のコミットを置かない。
if [ "$mode" = "remove" ]; then
  pages_branch_state
  [ $? -eq 2 ] && { echo "$folder: gh-pages が無いので変更なし"; exit 0; }
fi

for attempt in $(seq 1 "$max_attempts"); do
  if checkout_site; then
    apply_change "$@"
    applied=$?
    [ "$applied" -eq 3 ] && { echo "$folder/change-map.json がありません" >&2; exit 3; }
    [ "$applied" -eq 0 ] && commit_and_push && notify_stale && exit 0
  fi
  echo "gh-pages への反映に失敗しました($attempt 回目)。取り直してやり直します" >&2
  sleep $((attempt * retry_wait))
done
echo "gh-pages へ $max_attempts 回反映できませんでした" >&2
exit 1
