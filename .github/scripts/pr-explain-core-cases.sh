#!/usr/bin/env bash
#
# 解説ページの核の判定表。テンプレート(`.github/pr-explain/templates/index.html`)から固定
# スクリプトを抜き出して node の `vm` で評価し、`document` が無いときに置かれる `prExplainCore` を
# 叩いて、地図と解説の合流・振る舞いの節の並び・技術の手引きの節・用語の印・抜粋の強調・出てくる場所のコミットへの
# 届き方・今の節・箱の図の配置・コミットの差分・つながりの要約・戻るの履歴・確認の印の鍵・開く画面・色分け(`Tokenizer` と、
# `CommitDiff` / `ExcerptRows` の行をまたぐ読み進め)と、語彙・Target の kind・解説の形の道筋(impact・primers・terms・抜粋の
# 強調)・色分けの埋め込みが解説の検査(`build-pr-explain.py`・`lib/embedded_regions.py`)と揃っていることが期待どおりかを
# 1 コマンドで確かめる。
#
# 使い方: bash .github/scripts/pr-explain-core-cases.sh
# 出力が `ok` だけなら期待どおり。`NG` が 1 行でも出たら判定が変わっている。
#
# **どのケースも、既定値や素朴な実装と答えが違う入力を選ぶ。** 入力の順と答えの順を変えておき、件数・
# 添字・先頭だけを見る実装や、打ち切り・既定値で済ませる実装でも同じ答えにならないようにする。
#
# 組み立て(DOM を触る側)はここでは通らない。画面の配線は表示確認で見る。
#
# **判定表 3 本(これと `build-pr-explain-cases.sh`・`check-pr-explain-template-cases.sh`)は、区切りの語の付いた `<<` を PY / JS の
# ヒアドキュメントの外の行に書かない**(見本は Python の文字列で 1 行 1 要素に書く)。判定表も解説ページで色分けされ、外の行に
# あるとそこでヒアドキュメントを開いたと読まれて、後ろの色が崩れるため。最後の 2 ケース(埋め込みが閉じていること・開いた行の形)が
# これを確かめる。
#
# ケースは node の中の表 `cases` に 1 件ずつ並べ、`actual` の値を JSON にして `expected` と比べる。
set -uo pipefail

scripts_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$scripts_dir/../.." && pwd)"
template="$repo_root/.github/pr-explain/templates/index.html"
work="$(mktemp -d)" || exit 1
trap 'rm -rf "$work"' EXIT

source "$repo_root/.github/scripts/lib/cases-report.sh"

# 解説の検査が持つ語彙(ページの `Vocabulary` と突き合わせる)と、Target の kind ごとのキー(ページの `Target` と
# 突き合わせる)と、Shapes から導いた形の道筋と値の種類(ページの `ExplainShape.Routes` と突き合わせる)。impact の下は
# オブジェクト・その配列・id・id の配列だけ。primers・terms の下は文(text・sha・marked_text の文字列)も出す。Excerpt の中の
# 道筋は、Excerpt を指すすべての道筋の下に出す。primers・terms の下の必須の文と 1 つのオブジェクトの道筋と、それを必須とする
# kind(Variant の下なら kind の並び、Shape の下なら null。ページの `ExplainShape.Required` と突き合わせる)。ほかに、技術の
# 手引きの kind・段の kind・用語の印の綴りと、印を読む道筋と、`` ` `` の割り方(ページの `CodeSpans` と突き合わせる)。
checker="$(python3 - "$scripts_dir/build-pr-explain.py" <<'PY'
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("build_pr_explain", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
vocabulary = {
    "techniques": module.Techniques,
    "phases": module.Phases,
    "messageKinds": module.MessageKinds,
    "vias": module.Vias,
    "messageStatuses": module.MessageStatuses,
    "primerStatuses": module.PrimerStatuses,
    "remarkKinds": module.RemarkKinds,
}
target_keys = {kind: list(fields) for kind, fields in module.Variants["Target"].items()}
text_rules = (module.Text, module.Heading, module.UserText, module.Sha, module.MarkedText)
def kind_of(rule, is_many, with_text):
    if isinstance(rule, (module.Shape, module.Variant)):
        return "records" if is_many else "record"
    if rule == module.Id:
        return "ids" if is_many else "id"
    if with_text and rule in text_rules:
        return "texts" if is_many else "text"
    return None
def shape_routes_of(rule, route, with_text):
    return [[found, kind_of(inner, is_many, with_text)] for found, inner, is_many in module.routes_under(rule, route) if kind_of(inner, is_many, with_text) is not None]
def required_kinds_of(owner, key):
    if isinstance(owner, module.Shape):
        return None if module.Shapes[owner.name][key].required else []
    return [kind for kind, fields in module.Variants[owner.name].items() if key in fields and fields[key].required]
def required_routes_of(rule, route):
    found = module.routes_under(rule, route)
    owners = {at: inner for at, inner, _ in found}
    kinds_at = lambda at: required_kinds_of(owners[at.rpartition(".")[0].removesuffix("[]")], at.rpartition(".")[2])
    candidates = [{"route": at, "kinds": kinds_at(at)} for at, inner, is_many in found[1:] if kind_of(inner, is_many, True) in ("text", "record")]
    return [candidate for candidate in candidates if candidate["kinds"] != []]
explain = module.Shapes["Explain"]
routes = [*shape_routes_of(explain["impact"].value, "impact", False), *shape_routes_of(explain["primers"].value, "primers", True), *shape_routes_of(explain["terms"].value, "terms", True)]
required_routes = [*required_routes_of(explain["primers"].value, "primers"), *required_routes_of(explain["terms"].value, "terms")]
known = {route for route, _ in routes}
inside_excerpts = [found for route in module.routes_with(module.Shape("Excerpt")) for found in shape_routes_of(module.Shape("Excerpt"), route, False)[1:]]
shape_routes = routes + [found for found in inside_excerpts if found[0] not in known]
print(json.dumps({
    "vocabulary": vocabulary,
    "targetKeys": target_keys,
    "shapeRoutes": shape_routes,
    "requiredRoutes": required_routes,
    "primerKinds": list(module.Variants["Primer"]),
    "passageKinds": list(module.Variants["Passage"]),
    "termMarkPattern": module.TermMarkPattern.pattern,
    "markedRoutes": module.routes_with(module.MarkedText),
    "codeSpans": {text: module.code_spans_of(text) for text in ("前 `a` 中 `b", "``a`` `b`")},
}))
PY
)" || { echo "NG   解説の検査の語彙を読めない"; exit 1; }

# 色分けの埋め込み(要素とヒアドキュメント)について、検査の共有モジュール(`lib/embedded_regions.py`)の語と、各行の頭で
# 効いている埋め込みを開いた行。argv ではなく `$work` のファイルで渡す(Linux の引数 1 つの上限 131,072 バイトを超えるため)。
python3 - "$scripts_dir/lib" "$work" "$template" "$scripts_dir/pr-explain-core-cases.sh" "$scripts_dir/build-pr-explain-cases.sh" "$scripts_dir/check-pr-explain-template-cases.sh" <<'PY'
import json, sys
sys.path.insert(0, sys.argv[1])
from embedded_regions import EmbeddingElements, ElementExtensions, HeredocDelimiters, HeredocExtensions, opening_lines
work = sys.argv[2]
samples = {
    "heredocs.sh": [
        "cat <<JSON",
        '{"a": true}',
        "JSON",
        'node - <<"JS"',
        "const a = 1;",
        "JS",
        "python3 - <<'PY'",
        "x = 1",
        "PY",
        "cat <<-'TS'",
        "\tconst b: T = 1;",
        "\tTS",
        "cat <<'CASES'",
        "const c = 1;",
        "CASES",
        "cat << 'JS'",
        "const d = 1;",
        "JS",
        "echo done",
    ],
    "elements.html": [
        "<p>a</p>",
        "<STYLE>",
        "a { color: red; }",
        "</style>",
        '<script type="module">',
        'const a = "</p>";',
        'const css = "<style>a{}</style>";',
        "</SCRIPT>",
        "<script>const b = 1;</script>",
        "<p>b</p>",
    ],
}
for name, lines in samples.items():
    open(f"{work}/{name}", "w", encoding="utf-8").write("\n".join(lines) + "\n")
paths = [*sys.argv[3:], *(f"{work}/{name}" for name in samples)]
lines_of = lambda path: open(path, encoding="utf-8").read().split("\n")
json.dump({
    "elements": list(EmbeddingElements),
    "heredocs": list(HeredocDelimiters),
    "extensions": {"elements": list(ElementExtensions), "heredocs": list(HeredocExtensions)},
    "files": {path: opening_lines(path, lines_of(path)) for path in paths},
}, open(f"{work}/embeddings.json", "w", encoding="utf-8"))
PY
[ "$?" -eq 0 ] || { echo "NG   検査の埋め込みの開いた行を読めない"; exit 1; }

results="$(node - "$template" "$checker" "$work/embeddings.json" <<'JS'
const fs = require("fs");
const vm = require("vm");

const template = fs.readFileSync(process.argv[2], "utf8");
const {
  vocabulary: checkerVocabulary,
  targetKeys: checkerTargetKeys,
  shapeRoutes: checkerShapeRoutes,
  requiredRoutes: checkerRequiredRoutes,
  primerKinds: checkerPrimerKinds,
  passageKinds: checkerPassageKinds,
  termMarkPattern: checkerTermMarkPattern,
  markedRoutes: checkerMarkedRoutes,
  codeSpans: checkerCodeSpans,
} = JSON.parse(process.argv[3]);
const script = (template.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
if (script === undefined) {
  console.error("固定スクリプトが見つからない");
  process.exit(2);
}
const context = vm.createContext({});
vm.runInContext(script, context);
const core = context.prExplainCore;
if (core === undefined) {
  console.error("document の無い評価で prExplainCore が置かれていない");
  process.exit(2);
}
const { ExplainedMap, ExplainShape, ImpactTopics, PrimerTopics, CodeSpans, TermMarks, ExcerptRows, TopicScroll, ReviewCheck, ScreenChoice, TextScale, Tokenizer, CommitDiff, GraphLayout, ConnectionSentences, SelectionHistory, Vocabulary, Target } = core;

const Pr = 7;
const shaOf = (digit) => String(digit).repeat(40);
const changedFile = (path, extra = {}) => ({ path, changed: true, status: "M", oldPath: null, additions: 3, deletions: 1, target: null, ...extra });
const contextFile = (path) => ({ path, changed: false });
const commitOf = (digit) => ({ sha: shaOf(digit), merge: false, author: "a", date: `2026-01-0${digit}T00:00:00+00:00`, subject: `c${digit}`, body: "", files: [] });
const mapOf = (overrides = {}) => ({
  version: 2,
  pr: Pr,
  headBranch: "topic",
  baseBranch: "main",
  mergeBase: shaOf(9),
  head: shaOf(4),
  groups: [{ label: "utils", files: [changedFile("src/utils/Hub.ts")] }],
  tests: { added: [], removed: [], files: [] },
  commits: [1, 2, 3, 4].map(commitOf),
  dependencies: [],
  ...overrides,
});
const explainOf = (overrides = {}) => ({ version: 1, pr: Pr, sha: shaOf(4), overview: { title: "題", lead: "要約", before: [], after: [{ text: "後" }] }, ...overrides });
const concept = (path, name, extra = {}) => ({ path, name, role: "役割", ...extra });
const commitStory = (sha) => ({ sha, phase: "core", role: "役割", why: "理由" });
const suite = (id, file) => ({ id, label: id, file });
const test = (id, suiteId, name, extra = {}) => ({ id, suite: suiteId, name, techniques: ["state"], why: "w", given: "g", when: "w", then: "t", ...extra });
const absent = { kind: "absent" };
const explained = (map, explain) => ExplainedMap.create(map, { kind: "text", text: JSON.stringify(explain) });
const plain = (value) => JSON.parse(JSON.stringify(value));

// 差分の地図のファイルと、注釈を付けたコミットの差分。
const diffFile = (path, extra = {}) => ({ path, status: "M", oldPath: null, additions: 1, deletions: 1, patch: "", patchLines: 0, truncated: false, ...extra });
const noteOn = (path, start, end, text, extra = {}) => ({ path, start, end, text, ...extra });
const diffOf = (files, notes) => CommitDiff.create({ ...commitOf(1), files }, { ...commitStory(shaOf(1)), notes });
const linesOf = (rows) => rows.join("\n");
// 変更後の 1〜3 行目と 10〜12 行目の 2 つの hunk。4〜9 行目は差分に出ていない。
const twoHunks = linesOf(["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c", "@@ -10,3 +10,3 @@", " j", "-k", "+K", " l"]);
const numbersOf = (file) => file.body.hunks.map((hunk) => hunk.notes.map((note) => [note.n, note.text]));

// 色分け。パスの文法で、開いた行(無ければ null)の後から行を読み進めた、行ごとの字句の並び。
const lineTokensOf = (path, lines, openingLine = null) => {
  const grammar = Tokenizer.grammarOf(path);
  return Tokenizer.tokenizeLines(lines, grammar, Tokenizer.startAfter(openingLine, grammar)).map((read) => read.tokens);
};
// 色分けした行の、line 行目(0 始まり)で綴りが word の nth 番目(0 始まり)の字句の色。字句が無ければ、どの色とも違う綴りを返す。
const colorIn = (lineTokens, line, word, nth = 0) => {
  const found = lineTokens[line].filter((token) => token.value === word)[nth];
  return found === undefined ? "字句が無い" : found.cls;
};
const colorOf = (path, lines, { line = 0, word, nth = 0, openingLine = null }) => colorIn(lineTokensOf(path, lines, openingLine), line, word, nth);
// a.html の差分を地図の開いた行と組み、hunk ごとに、綴りが word の字句の色を行の順に並べる。
const hunkColorsOf = (patchLines, hunkOpeningLines, word) => {
  const [file] = diffOf([diffFile("a.html", { patch: linesOf(patchLines), hunkOpeningLines })], []).files;
  const grammar = Tokenizer.grammarOf("a.html");
  return file.body.hunks.map((hunk) => CommitDiff.lineTokensOf(hunk, grammar).flatMap((tokens) => tokens.filter((token) => token.value === word).map((token) => token.cls)));
};
// 文脈の行 1 本だけを持つ hunk 2 つ。
const twoScriptHunks = ["@@ -1,1 +1,1 @@", " const a = 1;", "@@ -10,1 +10,1 @@", " const b = 1;"];
const scriptOpened = { old: "<script>", new: "<script>" };

// 色分けの埋め込みの突き合わせ。前段が書いた、検査の語と、ファイルごとの各行の頭の開いた行。
const { elements: checkerElements, heredocs: checkerHeredocs, extensions: checkerExtensions, files: checkerOpenings } = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const checkedPaths = Object.keys(checkerOpenings);
const casesTables = checkedPaths.filter((path) => path.endsWith("-cases.sh"));
const checkedPathOf = (name) => checkedPaths.find((path) => path.endsWith(`/${name}`));
// ファイルを 1 行目から読み進めたときの、各行の頭の埋め込み(`region`)と、最後の行を読み終えた後の埋め込み。
const regionsAlong = (path) => {
  const grammar = Tokenizer.grammarOf(path);
  const start = Tokenizer.startAfter(null, grammar);
  const carries = [start, ...Tokenizer.tokenizeLines(fs.readFileSync(path, "utf8").split("\n"), grammar, start).map((read) => read.carry)];
  return { heads: carries.slice(0, -1).map((carry) => carry.region), last: carries[carries.length - 1].region };
};
// 検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと食い違う行(1 始まり)。
const regionMismatchesOf = (path) => {
  const grammar = Tokenizer.grammarOf(path);
  const { heads } = regionsAlong(path);
  const isSame = (opening, index) => JSON.stringify(Tokenizer.startAfter(opening, grammar).region) === JSON.stringify(heads[index]);
  return checkerOpenings[path].flatMap((opening, index) => (isSame(opening, index) ? [] : [index + 1]));
};
// 行の終わりが、区切りの語(引用符で囲むなら閉じた引用符)の付いた `<<` で終わるか。
const EndsWithHeredocStart = /<<-?[ \t]*(['"]?)[A-Za-z_]\w*\1$/;

// 箱の図の組と依存。graphGroup の箱は `組名/番号.ts`、boxesOf の箱は渡した名前で、lines はその箱の変更行数。
const graphGroup = (id, lines = [1]) => ({ id, boxes: lines.map((count, index) => ({ path: `${id}/${index}.ts`, lines: count })) });
const dependsOn = (from, to, status = "kept") => ({ from: `${from}/0.ts`, to: `${to}/0.ts`, status });
const boxesOf = (id, names, lines) => ({ id, boxes: names.map((name, index) => ({ path: name, lines: lines === undefined ? 1 : lines[index] })) });
// 上の段から順に、行ごとの組(畳んだ組)・箱(開いた組の中)を左から並べる。
const rowsOf = (units) => [...new Set(units.map((unit) => unit.y))].sort((a, b) => a - b).map((y) => units.filter((unit) => unit.y === y).sort((a, b) => a.x - b.x).map((unit) => (unit.kind === "box" ? unit.path : unit.group)));
const groupRowsOf = (groups, links, extra = {}) => rowsOf(GraphLayout.create({ groups, links, expanded: [], ...extra }).units);
// 変更行数が b > d > c > a の 4 つの組(段はどれも同じ)。
const fourGroups = () => [graphGroup("a", [5]), graphGroup("b", [40]), graphGroup("c", [10]), graphGroup("d", [30])];
// 同じ段に並んだ 2 つの組のあいだの間隔。
const columnGapOf = (labelWidth) => {
  const [left, right] = GraphLayout.create({ groups: [graphGroup("a", [2]), graphGroup("b", [1])], links: [], expanded: [], labelWidth }).units;
  return right.x - (left.x + left.width);
};
const message = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, name: id, ...extra });

// ハブ(Hub.ts)を変え、変更していない 5 本がそれを使っている地図。
const hubImporters = ["A", "B", "C", "D", "E"].map((name) => `src/features/${name}.ts`);
const hubMap = mapOf({
  groups: [
    { label: "utils", files: [changedFile("src/utils/Hub.ts")] },
    { label: "features", files: hubImporters.map(contextFile) },
  ],
  dependencies: hubImporters.map((from) => ({ from, to: "src/utils/Hub.ts", status: "kept" })),
});

// 振る舞い(impact)。表は 2 行 × 3 列で、マスの結果は `行id列id`(r1c2 など)。
const impactOf = (extra = {}) => ({ title: "題", lead: "要約", ...extra });
const topicsOf = (impact, setting = { map: mapOf(), explain: {} }) => explained(setting.map, explainOf({ ...setting.explain, impact })).impactTopics.topics;
const head = (id, label, extra = {}) => ({ id, label, ...extra });
const outcome = (rowHead, columnHead, result, extra = {}) => ({ rowHead, columnHead, result, ...extra });
const tableOf = (rowHeads, columnHeads, outcomes) => ({ label: "表", rowHeads, columnHeads, outcomes });
const addedOf = (label) => ({ label, before: [], after: [{ text: "後" }] });
const twoRows = [head("r1", "一"), head("r2", "二")];
const threeColumns = [head("c1", "一"), head("c2", "二"), head("c3", "三")];
const fullOutcomes = () => ["r1", "r2"].flatMap((row) => ["c1", "c2", "c3"].map((column) => outcome(row, column, `${row}${column}`)));
// 表を 1 つだけ書いた impact の、その表の節。
const tableTopicIn = (table) => topicsOf(impactOf({ tables: [table] }))[0];
// 表のマスを行ごとに並べる。空きは null。
const gridOf = (topic, pick = (outcome) => outcome.result) => topic.rows.map((row) => row.outcomes.map((outcome) => (outcome === null ? null : pick(outcome))));
// 根拠のテスト: a は追加、b は既存、t は未実装、u は判定なし(テスト名を調べていない、このブランチで変えたファイル)。
const testedMap = mapOf({
  groups: [{ label: "ハーネス", files: [changedFile("x-cases.sh"), changedFile("s.test.ts")] }],
  tests: { added: [{ file: "s.test.ts", name: "足した" }], removed: [], files: ["s.test.ts"] },
});
const testedExplain = (impact) => explainOf({
  suites: [suite("s", "s.test.ts"), suite("x", "x-cases.sh")],
  tests: [test("a", "s", "足した"), test("b", "s", "前から"), test("t", "s", "未実装", { todo: true }), test("u", "x", "調べていない")],
  impact,
});
const keptEvidenceOf = (ids) => explained(testedMap, testedExplain(impactOf({ kept: [{ text: "変わらない", tests: ids }] }))).impactTopics.topics[0].lines[0].tests;
// 仕組み: m1 は箱どうし、m3 は図に出さない concept へ、m4 は地図に無いファイルへ、m5 は図に出さない concept から箱へのやりとり。
const mechanismExplain = {
  map: mapOf({ groups: [{ label: "src", files: [changedFile("a.ts"), changedFile("b.ts"), changedFile("c.ts")] }] }),
  explain: {
    concepts: [concept("a.ts", "A"), concept("b.ts", "B"), concept("c.ts", "C", { graph: false })],
    messages: [message("m1", "a.ts", "b.ts", "cmd"), message("m3", "a.ts", "c.ts", "qry"), message("m4", "b.ts", "gone.ts", "evt"), message("m5", "c.ts", "a.ts", "evt")],
  },
};
const mechanismIdsOf = (changed) => topicsOf(impactOf({ changed }), mechanismExplain)[0].mechanisms.map((mechanism) => mechanism.message.id);
// テストを根拠に挙げている箇所を引く。変わらないことの 2 行は b と a、増えた状況は a、表は r2c1 と r1c3 のマスだけが t と a を挙げる。
const mentionedPlacesOf = (explainTestId) => {
  const impact = {
    title: "題",
    lead: "要約",
    kept: [{ text: "変わらない 1", tests: ["b"] }, { text: "変わらない 2", tests: ["a"] }],
    added: [{ label: "増えた", before: [], after: [{ text: "後" }], tests: ["a"] }],
    tables: [tableOf(twoRows, threeColumns, fullOutcomes().map((item) => (item.result === "r2c1" || item.result === "r1c3" ? { ...item, tests: ["t", "a"] } : item)))],
  };
  const result = explained(testedMap, testedExplain(impact));
  return ImpactTopics.mentionsOf(result.impactTopics, explainTestId).map((mention) => [mention.topic, mention.cell, mention.placeText]);
};

// 技術の手引き(primers)。節は必須のキーだけを持ち、extra で足す・差し替える。
const primerOf = (extra = {}) => ({ kind: "language", id: "p", category: "分類", label: "題", gist: "要するに", occurrences: [{ path: "a.ts", text: "ここ" }], ...extra });
const termOf = (id, label = id) => ({ id, label, text: `${label}の意味` });
const primerTopicsOf = (explain, map = mapOf()) => explained(map, explainOf(explain)).primerTopics;
const tabTopicsOf = (explain, tab) => primerTopicsOf(explain).tabs[tab].topics;
const shapeReasonOf = (explain) => explained(mapOf(), explainOf(explain)).reading.reason;
const passageExcerpt = (extra = {}) => ({ kind: "excerpt", excerpt: { path: "a.ts", start: 10, end: 14, ...extra } });
// 出てくる場所のコミットへの届き方。地図のコミットの files はパス(改名なら変更前のパスも)だけを見る。
const commitTouching = (digit, files, extra = {}) => ({ ...commitOf(digit), files, ...extra });
const reachesOf = ({ commits, explainedSha, path, shas, lineRange = { start: 3, end: 4 } }) => {
  const occurrence = { path, text: "ここ", shas, ...(lineRange === null ? {} : { lineRange }) };
  const map = mapOf({ commits, head: commits[commits.length - 1].sha });
  const topics = primerTopicsOf({ sha: explainedSha, primers: [primerOf({ occurrences: [occurrence] })] }, map).tabs.language.topics;
  return topics[0].occurrences[0].destinations.map(({ sha, reach }) => [sha, reach]);
};
// c1・c2 が a.ts、c3 が b.ts を変えた地図と、c2 が a.ts を z.ts へ移した地図と、c1 の後にマージコミット(2)がある地図。
const threeCommits = [commitTouching(1, [diffFile("a.ts")]), commitTouching(2, [diffFile("a.ts")]), commitTouching(3, [diffFile("b.ts")])];
const renamedCommits = [commitTouching(1, [diffFile("a.ts")]), commitTouching(2, [diffFile("z.ts", { oldPath: "a.ts", status: "R" })])];
const mergedCommits = [commitTouching(1, [diffFile("a.ts")]), commitTouching(2, [], { merge: true })];
const lineReach = { kind: "line", lineRange: { start: 3, end: 4 } };

const cases = [
  {
    label: "解説の sha が地図の head なら最新",
    actual: () => explained(mapOf(), explainOf()).freshness,
    expected: { kind: "latest", sha: shaOf(4) },
  },
  {
    label: "解説の sha が 4 件中 2 件目のコミットなら古く、以降は 2 コミット",
    actual: () => explained(mapOf(), explainOf({ sha: shaOf(2) })).freshness,
    expected: { kind: "stale", sha: shaOf(2), after: 2 },
  },
  {
    label: "解説の sha が地図のコミットに無ければ「地図に無い」",
    actual: () => explained(mapOf(), explainOf({ sha: shaOf(8) })).freshness,
    expected: { kind: "unknown", sha: shaOf(8) },
  },
  {
    label: "地図に無い sha の commitStories は別の一覧に出し、どのコミットにも付けない",
    actual: () => {
      const result = explained(mapOf(), explainOf({ commitStories: [commitStory(shaOf(3)), commitStory(shaOf(8))] }));
      return { stray: result.strayStories.map((story) => story.sha), attached: result.commits.map((commit) => (commit.story === null ? null : commit.story.sha)) };
    },
    expected: { stray: [shaOf(8)], attached: [null, null, shaOf(3), null] },
  },
  {
    label: "解説が無いとき、テストは地図の追加と、テストファイルの対象から作る",
    actual: () => {
      const testFile = "src/utils/__tests__/Hub.normal.test.ts";
      const map = mapOf({
        groups: [{ label: "utils", files: [changedFile("src/utils/Hub.ts"), changedFile(testFile, { status: "A", target: "src/utils/Hub.ts" })] }],
        tests: { added: [{ file: testFile, name: "足したテスト" }], removed: [], files: [testFile] },
      });
      return ExplainedMap.create(map, absent).tests.map((item) => ({ name: item.name, status: item.status, targets: item.targets }));
    },
    expected: [{ name: "足したテスト", status: "new", targets: ["src/utils/Hub.ts"] }],
  },
  {
    label: "解説が無いとき、まとめ方は層だけ",
    actual: () => Object.keys(ExplainedMap.create(mapOf(), absent).groupings),
    expected: ["layer"],
  },
  {
    label: "解説なしのとき、表示名はファイル名(退けた解説の concept 名を使わない)",
    actual: () => {
      const rejected = explainOf({ pr: Pr + 1, concepts: [concept("src/utils/Hub.ts", "ハブ")] });
      return explained(mapOf(), rejected).entries.map((entry) => ExplainedMap.nameOf(entry, "concept"));
    },
    expected: ["Hub.ts"],
  },
  {
    label: "JSON として読めない解説は、理由を「読めない」として解説なしにする",
    actual: () => ExplainedMap.create(mapOf(), { kind: "text", text: "{" }).reading.reason.kind,
    expected: "unreadable",
  },
  {
    label: "version が 1 でない解説は、理由を version として解説なしにする",
    actual: () => explained(mapOf(), explainOf({ version: 2 })).reading.reason,
    expected: { kind: "version", actual: 2 },
  },
  {
    label: "pr が地図と違う解説は、理由を pr として解説なしにする",
    actual: () => explained(mapOf(), explainOf({ pr: Pr + 1 })).reading.reason,
    expected: { kind: "pr", actual: Pr + 1 },
  },
  {
    label: "一覧のキーが配列でない解説は、理由を型として解説なしにする",
    actual: () => explained(mapOf(), explainOf({ concepts: {} })).reading.reason,
    expected: { kind: "shape", key: "concepts" },
  },
  {
    label: "テスト名を調べたファイルの解説のテストは、地図の追加に同じファイルと名前があれば new、無ければ old",
    actual: () => {
      const map = mapOf({ tests: { added: [{ file: "s.test.ts", name: "足した" }], removed: [], files: ["s.test.ts", "u.test.ts"] } });
      const explain = explainOf({
        suites: [suite("s", "s.test.ts"), suite("u", "u.test.ts")],
        tests: [test("a", "s", "足した"), test("b", "s", "前から"), test("c", "u", "足した")],
      });
      return explained(map, explain).tests.map((item) => [item.test.id, item.status]);
    },
    expected: [["a", "new"], ["b", "old"], ["c", "old"]],
  },
  {
    label: "テスト名を調べていないファイルのテストは、このブランチで足したファイルなら new、それ以外は判定なし",
    actual: () => {
      const map = mapOf({
        groups: [{ label: "ハーネス", files: [changedFile("added-cases.sh", { status: "A" }), changedFile("changed-cases.sh"), changedFile("s.test.ts", { status: "A" })] }],
        tests: { added: [], removed: [], files: ["s.test.ts"] },
      });
      const explain = explainOf({
        suites: [suite("a", "added-cases.sh"), suite("c", "changed-cases.sh"), suite("s", "s.test.ts")],
        tests: [test("a1", "a", "足したファイルのテスト"), test("c1", "c", "変えたファイルのテスト"), test("s1", "s", "調べたファイルの名前の無いテスト")],
      });
      return explained(map, explain).tests.map((item) => [item.test.id, item.status]);
    },
    expected: [["a1", "new"], ["c1", "unjudged"], ["s1", "old"]],
  },
  {
    label: "地図の削除にあるテストは、解説が無くても「削除」として追加の後に出る",
    actual: () => {
      const map = mapOf({ tests: { added: [{ file: "s.test.ts", name: "足した" }], removed: [{ file: "s.test.ts", name: "消した" }], files: ["s.test.ts"] } });
      return ExplainedMap.create(map, absent).tests.map((item) => [item.name, item.status]);
    },
    expected: [["足した", "new"], ["消した", "removed"]],
  },
  {
    label: "解説を書いた後に足したテスト(地図の追加にあって解説に無いもの)は、解説のテストの後に「追加」として足す",
    actual: () => {
      const map = mapOf({ tests: { added: [{ file: "s.test.ts", name: "後から足した" }, { file: "s.test.ts", name: "足した" }], removed: [], files: ["s.test.ts"] } });
      const explain = explainOf({ suites: [suite("s", "s.test.ts")], tests: [test("a", "s", "足した")] });
      return explained(map, explain).tests.map((item) => [item.name, item.status, item.test === null ? null : item.test.id]);
    },
    expected: [["足した", "new", "a"], ["後から足した", "new", null]],
  },
  {
    label: "todo のテストは、地図の追加に同じ名前があっても todo",
    actual: () => {
      const map = mapOf({ tests: { added: [{ file: "s.test.ts", name: "足した" }], removed: [], files: ["s.test.ts"] } });
      const explain = explainOf({ suites: [suite("s", "s.test.ts")], tests: [test("a", "s", "足した", { todo: true })] });
      return explained(map, explain).tests.map((item) => item.status);
    },
    expected: ["todo"],
  },
  {
    label: "箱は変更ファイルと concepts の名指しだけで、ハブを使う残りは「ほかに n」に畳む",
    actual: () => {
      const result = explained(hubMap, explainOf({ concepts: [concept("src/features/B.ts", "B")] }));
      const hub = result.entries.find((entry) => entry.path === "src/utils/Hub.ts");
      return { boxes: result.entries.filter((entry) => entry.inGraph).map((entry) => entry.path), others: hub.others };
    },
    expected: { boxes: ["src/utils/Hub.ts", "src/features/B.ts"], others: ["src/features/A.ts", "src/features/C.ts", "src/features/D.ts", "src/features/E.ts"] },
  },
  {
    label: "graph が偽の concept は木にだけ出し、箱にしない",
    actual: () => {
      const layer = explained(mapOf(), explainOf({ concepts: [concept("src/utils/Hub.ts", "ハブ", { graph: false })] })).groupings.layer[0];
      return { tree: layer.treePaths, boxes: layer.paths };
    },
    expected: { tree: ["src/utils/Hub.ts"], boxes: [] },
  },
  {
    label: "機能でまとめると、feature の無い箱は未分類に入る",
    actual: () => {
      const map = mapOf({ groups: [{ label: "utils", files: [changedFile("src/utils/Hub.ts"), changedFile("src/utils/Other.ts"), contextFile("src/utils/Ctx.ts")] }] });
      const explain = explainOf({
        features: [{ id: "f", label: "機能", role: "役割" }],
        concepts: [concept("src/utils/Hub.ts", "ハブ", { feature: "f" }), concept("src/utils/Ctx.ts", "文脈")],
      });
      return explained(map, explain).groupings.feature.map((group) => ({ kind: group.kind, paths: group.paths }));
    },
    expected: [{ kind: "feature", paths: ["src/utils/Hub.ts"] }, { kind: "unassigned", paths: ["src/utils/Other.ts", "src/utils/Ctx.ts"] }],
  },
  {
    label: "features が空なら、concepts があってもまとめ方は層だけ",
    actual: () => Object.keys(explained(mapOf(), explainOf({ features: [], concepts: [concept("src/utils/Hub.ts", "ハブ")] })).groupings),
    expected: ["layer"],
  },
  {
    label: "表示名は concept 名、無ければファイル名で、index.* には親フォルダを付ける",
    actual: () => {
      const map = mapOf({ groups: [{ label: "src", files: [changedFile("src/a/Named.ts"), changedFile("src/domains/unit/px/index.ts"), changedFile("src/utils/Plain.ts")] }] });
      const entries = explained(map, explainOf({ concepts: [concept("src/a/Named.ts", "名前")] })).entries;
      return { concept: entries.map((entry) => ExplainedMap.nameOf(entry, "concept")), file: entries.map((entry) => ExplainedMap.nameOf(entry, "file")) };
    },
    expected: { concept: ["名前", "px/index.ts", "Plain.ts"], file: ["Named.ts", "px/index.ts", "Plain.ts"] },
  },
  {
    label: "ページが読めるのは version 2 の地図だけ(1 も 3 も、オブジェクトでないものも読めない)",
    actual: () => [mapOf(), mapOf({ version: 1 }), mapOf({ version: 3 }), [], null].map(ExplainedMap.isReadableMap),
    expected: [true, false, false, false, false],
  },
  {
    label: "箱の図では、使う側の組が上の段、使われる側の組が下の段に並ぶ",
    actual: () => groupRowsOf([graphGroup("domain"), graphGroup("ui"), graphGroup("app")], [dependsOn("ui", "app"), dependsOn("app", "domain")]),
    expected: [["ui"], ["app"], ["domain"]],
  },
  {
    label: "段の深さは最長の道のりで、近道の依存(a → c)があっても c は b の下に来る",
    actual: () => groupRowsOf([graphGroup("a"), graphGroup("b"), graphGroup("c")], [dependsOn("b", "c"), dependsOn("a", "c"), dependsOn("a", "b")]),
    expected: [["a"], ["b"], ["c"]],
  },
  {
    label: "浅い道のりの依存(x → c)が先に並んでいても、c は長い道のり(a → b → c)の深さになる",
    actual: () => groupRowsOf([graphGroup("x"), graphGroup("a"), graphGroup("b"), graphGroup("c")], [dependsOn("b", "c"), dependsOn("a", "b"), dependsOn("x", "c")]),
    expected: [["x", "a"], ["b"], ["c"]],
  },
  {
    label: "互いに使い合う組は同じ段に並び、それを使う組がその上の段に来る",
    actual: () => groupRowsOf([graphGroup("b"), graphGroup("c"), graphGroup("a")], [dependsOn("a", "b"), dependsOn("b", "a"), dependsOn("c", "a")]),
    expected: [["c"], ["b", "a"]],
  },
  {
    label: "開いた組の中の箱も、互いに使い合うものは同じ段に並ぶ",
    actual: () => {
      const links = [{ from: "x", to: "y", status: "kept" }, { from: "y", to: "x", status: "kept" }, { from: "z", to: "x", status: "added" }];
      return rowsOf(GraphLayout.create({ groups: [boxesOf("g", ["y", "z", "x"])], links, expanded: ["g"] }).units);
    },
    expected: [["z"], ["y", "x"]],
  },
  {
    label: "同じ段の箱は 1 行に 4 つまでで、5 つ目は次の行に回る",
    actual: () => rowsOf(GraphLayout.create({ groups: [boxesOf("g", ["a", "b", "c", "d", "e"])], links: [], expanded: ["g"] }).units),
    expected: [["a", "b", "c", "d"], ["e"]],
  },
  {
    label: "消えた依存は段に使わず、その 2 つの組は同じ段に並ぶ",
    actual: () => groupRowsOf([graphGroup("a"), graphGroup("b")], [dependsOn("a", "b", "removed")]),
    expected: [["a", "b"]],
  },
  {
    label: "置ける広さを渡すと、等倍で収まる並びどうしでは 1 段に多く並べるものを選ぶ",
    actual: () => groupRowsOf(fourGroups(), [], { room: { width: 520, height: 900 } }),
    expected: [["b", "d"], ["c", "a"]],
  },
  {
    label: "等倍で収まる並びが 1 段 1 つだけなら、組を縦に 1 列に並べる",
    actual: () => groupRowsOf(fourGroups(), [], { room: { width: 300, height: 900 } }),
    expected: [["b"], ["d"], ["c"], ["a"]],
  },
  {
    label: "ラベルの幅を渡すと、横に並んだ組の間隔はそれが入る幅になり(上限 240px)、渡さなければ 72px",
    actual: () => [0, 150, 400].map(columnGapOf),
    expected: [72, 158, 240],
  },
  {
    label: "同じ 2 つの単位を両向きに結ぶ線は両向きと分かり、片向きの link が何本あっても両向きにはならない",
    actual: () => {
      const layout = GraphLayout.create({ groups: [graphGroup("a"), graphGroup("b")], links: [], expanded: [] });
      const link = (from, to) => ({ from: `${from}/0.ts`, to: `${to}/0.ts`, item: `${from}>${to}`, leads: true });
      return [[link("a", "b"), link("b", "a")], [link("a", "b"), link("a", "b")]].map((links) => GraphLayout.edgesOf(layout, links)[0].isBothWays);
    },
    expected: [true, false],
  },
  {
    label: "抽象度が中なら、4 つの組のうち変更行数の多い 2 つを開く",
    actual: () => GraphLayout.expandedAt(GraphLayout.Levels.Mid, [graphGroup("a", [5]), graphGroup("b", [40]), graphGroup("c", [10]), graphGroup("d", [30])]),
    expected: ["b", "d"],
  },
  {
    label: "抽象度が中なら、組が 1 つだけでもそれを開く",
    actual: () => GraphLayout.expandedAt(GraphLayout.Levels.Mid, [graphGroup("a", [5])]),
    expected: ["a"],
  },
  {
    label: "抽象度が中なら、開く組の数は ⌈n/3⌉(3 つなら 1 つ、6 つなら 2 つ)",
    actual: () => [[5, 40, 10], [5, 40, 10, 30, 20, 1]].map((sizes) => GraphLayout.expandedAt(GraphLayout.Levels.Mid, sizes.map((lines, index) => graphGroup(`g${index}`, [lines])))),
    expected: [["g1"], ["g1", "g3"]],
  },
  {
    label: "抽象度が高なら、どの組も開かない",
    actual: () => GraphLayout.expandedAt(GraphLayout.Levels.High, [graphGroup("a", [5]), graphGroup("b", [40])]),
    expected: [],
  },
  {
    label: "抽象度が低なら、すべての組を入力の順に開く",
    actual: () => GraphLayout.expandedAt(GraphLayout.Levels.Low, [graphGroup("a", [5]), graphGroup("b", [40])]),
    expected: ["a", "b"],
  },
  {
    label: "箱の無い組は、開く組にも中の ⌈n/3⌉ の数にも入らない",
    actual: () => {
      const groups = [graphGroup("a", [5]), graphGroup("empty", []), graphGroup("b", [40]), graphGroup("c", [10])];
      return [GraphLayout.Levels.Mid, GraphLayout.Levels.Low].map((level) => GraphLayout.expandedAt(level, groups));
    },
    expected: [["b"], ["a", "b", "c"]],
  },
  {
    label: "同じ段の組は、変更行数の多い順に左から並ぶ",
    actual: () => groupRowsOf([graphGroup("a", [5]), graphGroup("b", [40]), graphGroup("c", [10])], []),
    expected: [["b", "c", "a"]],
  },
  {
    label: "注釈は行の入る最初の hunk に付き、番号は入力の順ではなく hunk の順にファイルの中で通す",
    actual: () => {
      const notes = [noteOn("src/a.ts", 11, 11, "二つ目"), noteOn("src/a.ts", 3, 10, "またぐ")];
      return numbersOf(diffOf([diffFile("src/a.ts", { patch: twoHunks })], notes).files[0]);
    },
    expected: [[[1, "またぐ"]], [[2, "二つ目"]]],
  },
  {
    label: "hunk のあいだの行への注釈は、差分に出ていない行への注釈として番号を続けて回す",
    actual: () => {
      const file = diffOf([diffFile("src/a.ts", { patch: twoHunks })], [noteOn("src/a.ts", 2, 2, "差分の中"), noteOn("src/a.ts", 6, 7, "あいだ")]).files[0];
      return { placed: numbersOf(file), unplaced: file.unplaced.map((note) => [note.n, note.text]) };
    },
    expected: { placed: [[[1, "差分の中"]], []], unplaced: [[2, "あいだ"]] },
  },
  {
    label: "side が old の注釈は、変更前の行番号で hunk と光らせる行を決める",
    actual: () => {
      const patch = linesOf(["@@ -10,3 +10,1 @@", "-a", "-b", " c", "@@ -30,2 +28,2 @@", " x", "-y", "+Y"]);
      const note = noteOn("src/a.ts", 11, 11, "消した行", { side: "old" });
      const hunks = diffOf([diffFile("src/a.ts", { patch })], [note]).files[0].body.hunks;
      return { hunk: hunks.findIndex((hunk) => hunk.notes.length > 0), covered: hunks.flatMap((hunk) => hunk.lines).filter((line) => CommitDiff.hasLine(note, line)).map((line) => line.text) };
    },
    expected: { hunk: 0, covered: ["b"] },
  },
  {
    label: "`\\ No newline at end of file` は行に数えず、その後の行番号をずらさない",
    actual: () => {
      const patch = linesOf(["@@ -1,2 +1,3 @@", " a", "-b", "\\ No newline at end of file", "+b", "+c"]);
      const note = noteOn("src/a.ts", 3, 3, "足した行");
      const hunk = diffOf([diffFile("src/a.ts", { patch })], [note]).files[0].body.hunks[0];
      return hunk.lines.filter((line) => CommitDiff.hasLine(note, line)).map((line) => line.text);
    },
    expected: ["c"],
  },
  {
    label: "そのコミットに無いパスへの注釈は、どのファイルにも付けず「地図に無い」に回す",
    actual: () => {
      const result = diffOf([diffFile("src/a.ts")], [noteOn("src/a.ts", 1, 1, "ある"), noteOn("src/gone.ts", 1, 1, "無い")]);
      return { stray: result.strayNotes.map((note) => note.path), onFile: result.files[0].unplaced.map((note) => note.text) };
    },
    expected: { stray: ["src/gone.ts"], onFile: ["ある"] },
  },
  {
    label: "切った patch の残り行数は、切る前の行数から見せた行数を引いたもので、切っていなければ 0",
    actual: () => {
      const patch = linesOf(["@@ -1 +1 @@", "-a", "+b"]);
      const result = diffOf([diffFile("src/a.ts", { patch, patchLines: 10, truncated: true }), diffFile("src/b.ts", { patch, patchLines: 10 })], []);
      return result.files.map((file) => file.body.remaining);
    },
    expected: [7, 0],
  },
  {
    label: "patch が空なら中身の変更なし、null なら消したファイル(変更前の行への注釈はそこに付く)かバイナリ",
    actual: () => {
      const files = [
        diffFile("src/moved.ts", { status: "R", oldPath: "src/old.ts" }),
        diffFile("src/gone.ts", { status: "D", additions: 0, deletions: 61, patch: null }),
        diffFile("src/image.png", { status: "A", additions: null, deletions: null, patch: null }),
      ];
      const notes = [noteOn("src/gone.ts", 5, 6, "消した行", { side: "old" }), noteOn("src/gone.ts", 1, 1, "変更後")];
      return diffOf(files, notes).files.map((file) => ({ kind: file.body.kind, lines: file.body.lines ?? null, onBody: (file.body.notes ?? []).map((note) => [note.n, note.text]), unplaced: file.unplaced.map((note) => [note.n, note.text]) }));
    },
    expected: [
      { kind: "unchanged", lines: null, onBody: [], unplaced: [] },
      { kind: "deleted", lines: 61, onBody: [[1, "消した行"]], unplaced: [[2, "変更後"]] },
      { kind: "binary", lines: null, onBody: [], unplaced: [] },
    ],
  },
  {
    label: "消したファイルの行数を超える変更前の注釈は本文に付けず、バイナリへの注釈も落とさずに本文の外に回す",
    actual: () => {
      const files = [
        diffFile("src/gone.ts", { status: "D", additions: 0, deletions: 3, patch: null }),
        diffFile("src/image.png", { status: "A", additions: null, deletions: null, patch: null }),
      ];
      const notes = [noteOn("src/gone.ts", 5, 5, "行数の外", { side: "old" }), noteOn("src/gone.ts", 2, 2, "行数の中", { side: "old" }), noteOn("src/image.png", 1, 1, "画像")];
      return diffOf(files, notes).files.map((file) => ({ onBody: (file.body.notes ?? []).map((note) => [note.n, note.text]), unplaced: file.unplaced.map((note) => [note.n, note.text]) }));
    },
    expected: [
      { onBody: [[1, "行数の中"]], unplaced: [[2, "行数の外"]] },
      { onBody: [], unplaced: [[1, "画像"]] },
    ],
  },
  {
    label: "コードの表示では、続けて消した行を 1 つに畳み、あいだに残った行で分ける",
    actual: () => {
      const patch = linesOf(["@@ -1,5 +1,3 @@", " a", "-b", "-c", "+d", "-e", " f"]);
      const hunk = diffOf([diffFile("src/a.ts", { patch })], []).files[0].body.hunks[0];
      return CommitDiff.codeRowsOf(hunk).map((row) => (row.kind === "gap" ? ["gap", row.lines.map((line) => line.text)] : ["line", row.line.text]));
    },
    expected: [["line", "a"], ["gap", ["b", "c"]], ["line", "d"], ["gap", ["e"]], ["line", "f"]],
  },
  {
    label: "つながりの要約は、線の向き → 逆向き、コマンド → クエリ → イベントの順にまとめ、消えたやりとりは最後に 1 つにする",
    actual: () => {
      const unitOf = new Map([["a.ts", "A"], ["b.ts", "B"]]);
      const messages = [
        message("e", "b.ts", "a.ts", "evt"),
        message("q", "a.ts", "b.ts", "qry", { status: "added" }),
        message("r", "a.ts", "b.ts", "cmd", { status: "removed" }),
        message("c1", "a.ts", "b.ts", "cmd"),
        message("c3", "b.ts", "a.ts", "cmd", { status: "changed" }),
        message("c2", "a.ts", "b.ts", "cmd"),
      ];
      return ConnectionSentences.collect({ ends: ["A", "B"], messages, unitOf }).map((sentence) => [sentence.kind, sentence.from, sentence.to, sentence.messages.map((item) => item.id)]);
    },
    expected: [["cmd", "A", "B", ["c1", "c2"]], ["qry", "A", "B", ["q"]], ["cmd", "B", "A", ["c3"]], ["evt", "B", "A", ["e"]], ["removed", null, null, ["r"]]],
  },
  {
    label: "戻るの履歴は 40 件までで、41 件目を足すと最も古いものが落ちる",
    actual: () => {
      const history = Array.from({ length: 41 }, (_, index) => index).reduce((sofar, index) => SelectionHistory.recorded(sofar, index), []);
      return [history.length, history[0], history[history.length - 1]];
    },
    expected: [40, 1, 40],
  },
  {
    label: "戻ると最後に足した選択になって履歴から外れ、履歴が空なら戻らない",
    actual: () => [SelectionHistory.back(["a", null, "b"], () => true), SelectionHistory.back([], () => true)],
    expected: [{ selection: "b", history: ["a", null] }, null],
  },
  {
    label: "戻るときは、もう選べない選択を飛ばしてその前へ戻り、選べるものが無ければ戻らない",
    actual: () => {
      const isAvailable = (selection) => selection !== "gone";
      return [SelectionHistory.back(["a", "b", "gone", "gone"], isAvailable), SelectionHistory.back(["gone"], isAvailable)];
    },
    expected: [{ selection: "b", history: ["a"] }, null],
  },
  {
    label: "確認の印の鍵は、同じ sha と同じ文なら同じ",
    actual: () => ReviewCheck.keyOf(shaOf(1), "見るところ") === ReviewCheck.keyOf(shaOf(1), "見るところ"),
    expected: true,
  },
  {
    label: "確認の印の鍵は、文が変われば別",
    actual: () => ReviewCheck.keyOf(shaOf(1), "見るところ") === ReviewCheck.keyOf(shaOf(1), "見るところを書き直した"),
    expected: false,
  },
  {
    label: "確認の印の鍵は、sha が変われば別",
    actual: () => ReviewCheck.keyOf(shaOf(1), "見るところ") === ReviewCheck.keyOf(shaOf(2), "見るところ"),
    expected: false,
  },
  {
    label: "文字サイズが保存されていなければ100%で開く",
    actual: () => [TextScale.choose(null), TextScale.choose(undefined)],
    expected: [100, 100],
  },
  {
    label: "文字サイズは上下限を含む保存値をそのまま再利用する",
    actual: () => [200, 80, 150, 90].map(TextScale.choose),
    expected: [200, 80, 150, 90],
  },
  {
    label: "不正な型・範囲外・10%刻みでない保存値は100%へ戻す",
    actual: () => ["120", true, {}, [], 70, 210, 85, 120.5, NaN, Infinity, -Infinity].map(TextScale.choose),
    expected: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  },
  {
    label: "文字を連続で拡大しても200%を越えず、縮小しても80%を下回らない",
    actual: () => {
      let value = TextScale.choose(180);
      const enlarged = Array.from({ length: 4 }, () => {
        value = TextScale.increase(value);
        return value;
      });
      value = TextScale.choose(100);
      const reduced = Array.from({ length: 4 }, () => {
        value = TextScale.decrease(value);
        return value;
      });
      return { enlarged, reduced };
    },
    expected: { enlarged: [190, 200, 200, 200], reduced: [90, 80, 80, 80] },
  },
  {
    label: "拡大後に縮小すると直前の文字サイズへ戻り、リセット後は100%から操作できる",
    actual: () => {
      const enlarged = TextScale.increase(130);
      const reduced = TextScale.decrease(enlarged);
      const reset = TextScale.reset();
      return [enlarged, reduced, reset, TextScale.increase(reset), TextScale.decrease(reset)];
    },
    expected: [140, 130, 100, 110, 90],
  },
  {
    label: "開く画面は、ハッシュが画面を指していれば保存値より優先する",
    actual: () => ScreenChoice.choose({ hash: "#story", saved: "test" }),
    expected: "story",
  },
  {
    label: "ハッシュが無いか知らない値なら保存値、それも無いか知らない値なら構造マップ",
    actual: () => [
      ScreenChoice.choose({ hash: "#nope", saved: "test" }),
      ScreenChoice.choose({ hash: "", saved: "story" }),
      ScreenChoice.choose({ hash: "", saved: null }),
      ScreenChoice.choose({ hash: "#nope", saved: "nope" }),
    ],
    expected: ["test", "story", "map", "map"],
  },
  {
    label: "ハッシュが #impact なら、保存値より振る舞いの画面を優先する",
    actual: () => ScreenChoice.choose({ hash: "#impact", saved: "test" }),
    expected: "impact",
  },
  {
    label: "ハッシュが #primer なら、保存値(テスト)より技術の手引きを優先する",
    actual: () => ScreenChoice.choose({ hash: "#primer", saved: "test" }),
    expected: "primer",
  },
  {
    label: "ハッシュが無く、保存値が振る舞いの画面ならそれを開く",
    actual: () => ScreenChoice.choose({ hash: "", saved: "impact" }),
    expected: "impact",
  },
  {
    label: "impact が配列の解説は、理由を impact の型として解説なしにする",
    actual: () => explained(mapOf(), explainOf({ impact: [] })).reading.reason,
    expected: { kind: "shape", key: "impact" },
  },
  {
    label: "impact が null の解説は、理由を impact の型として解説なしにする",
    actual: () => explained(mapOf(), explainOf({ impact: null })).reading.reason,
    expected: { kind: "shape", key: "impact" },
  },
  {
    label: "impact の変わったこと(changed)が配列なら、理由はその道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ changed: [] }) })).reading.reason,
    expected: { kind: "shape", key: "impact.changed" },
  },
  {
    label: "状況の表のマスの一覧(outcomes)がオブジェクトなら、理由はその道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ tables: [tableOf([head("r", "行")], [head("c", "列")], {})] }) })).reading.reason,
    expected: { kind: "shape", key: "impact.tables[].outcomes" },
  },
  {
    label: "マスの tests が文字列なら、理由はその道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ tables: [tableOf([head("r", "行")], [head("c", "列")], [outcome("r", "c", "結果", { tests: "t1" })])] }) })).reading.reason,
    expected: { kind: "shape", key: "impact.tables[].outcomes[].tests" },
  },
  {
    label: "これまでの行(before)の要素がオブジェクトでなければ、理由はその配列の道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ changed: { before: [null], after: [{ text: "後" }] } }) })).reading.reason,
    expected: { kind: "shape", key: "impact.changed.before" },
  },
  {
    label: "変わらないことの tests の要素が文字列でなければ、理由はその道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ kept: [{ text: "変わらない", tests: [5] }] }) })).reading.reason,
    expected: { kind: "shape", key: "impact.kept[].tests" },
  },
  {
    label: "前後の行の message が数値なら、理由はその道筋",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ changed: { before: [], after: [{ text: "後", message: 5 }] } }) })).reading.reason,
    expected: { kind: "shape", key: "impact.changed.after[].message" },
  },
  {
    label: "形の崩れが 2 か所あれば、表の並びで先の道筋ではなく、外側(段の少ない)の道筋を理由にする",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ changed: { before: [], after: [{ text: "後", message: 5 }] }, tables: "表" }) })).reading.reason,
    expected: { kind: "shape", key: "impact.tables" },
  },
  {
    label: "ページが形を見る道筋と値の種類は、解説の検査の形(Shapes)から導いたものと同じ",
    actual: () => ExplainShape.Routes.map(([route, kind]) => [route, kind]),
    expected: checkerShapeRoutes,
  },
  {
    label: "ページが欠けを見る道筋とそれを必須とする kind は、解説の検査の形(Shapes・Variants)の primers・terms の下の必須の文と 1 つのオブジェクトと同じ",
    actual: () => ExplainShape.Required,
    expected: checkerRequiredRoutes,
  },
  {
    label: "解説が無いとき、振る舞いの節は「解説なし」",
    actual: () => ExplainedMap.create(mapOf(), absent).impactTopics,
    expected: { kind: "none" },
  },
  {
    label: "退けた解説(pr が違う)は、impact が書いてあっても振る舞いは「解説なし」",
    actual: () => explained(mapOf(), explainOf({ pr: Pr + 1, impact: impactOf({ kept: [{ text: "変わらない" }] }) })).impactTopics,
    expected: { kind: "none" },
  },
  {
    label: "impact が無ければ、overview の前後があっても振る舞いは「書かれていない」",
    actual: () => explained(mapOf(), explainOf({ overview: { title: "題", lead: "要約", before: [{ text: "前" }], after: [{ text: "後" }] } })).impactTopics,
    expected: { kind: "unwritten" },
  },
  {
    label: "impact が題と要約だけなら、節は 0 件",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf() })).impactTopics,
    expected: { kind: "written", title: "題", lead: "要約", topics: [] },
  },
  {
    label: "節の並びは書いた順によらず、変わったこと → 状況の表 → 増えた状況 → 変わらないこと",
    actual: () => {
      const impact = { kept: [{ text: "変わらない" }], added: [addedOf("増えた 1"), addedOf("増えた 2")], tables: [tableOf([head("r", "行")], [head("c", "列")], [outcome("r", "c", "結果")]), tableOf([head("r", "行")], [head("c", "列")], [outcome("r", "c", "結果")])], changed: { before: [], after: [{ text: "後" }] }, title: "題", lead: "要約" };
      return topicsOf(impact).map((topic) => topic.id);
    },
    expected: ["changed", "table-0", "table-1", "added-0", "added-1", "kept"],
  },
  {
    label: "変わらないこと(kept)が空なら、その節は出ない",
    actual: () => topicsOf(impactOf({ changed: { before: [], after: [{ text: "後" }] }, kept: [] })).map((topic) => topic.id),
    expected: ["changed"],
  },
  {
    label: "列ごとに書いた 2 × 3 のマスは、行の見出し × 列の見出しの順に並ぶ",
    actual: () => {
      const outcomes = ["c1", "c2", "c3"].flatMap((column) => ["r1", "r2"].map((row) => outcome(row, column, `${row}${column}`)));
      return gridOf(tableTopicIn(tableOf(twoRows, threeColumns, outcomes)));
    },
    expected: [["r1c1", "r1c2", "r1c3"], ["r2c1", "r2c2", "r2c3"]],
  },
  {
    label: "書いていない組み合わせのマスは空き(null)になり、後ろのマスは詰めない",
    actual: () => gridOf(tableTopicIn(tableOf(twoRows, threeColumns, fullOutcomes().filter((item) => item.result !== "r1c2")))),
    expected: [["r1c1", null, "r1c3"], ["r2c1", "r2c2", "r2c3"]],
  },
  {
    label: "同じ組み合わせのマスを 2 つ書いたら、先に書いたものを使う",
    actual: () => gridOf(tableTopicIn(tableOf(twoRows, threeColumns, [outcome("r2", "c3", "先"), ...fullOutcomes(), outcome("r2", "c3", "後")])))[1][2],
    expected: "先",
  },
  {
    label: "見出しに無い id のマスは、表に並ばない",
    actual: () => gridOf(tableTopicIn(tableOf(twoRows, threeColumns, [...fullOutcomes(), outcome("r9", "c1", "迷子"), outcome("r1", "c9", "迷子")]))),
    expected: [["r1c1", "r1c2", "r1c3"], ["r2c1", "r2c2", "r2c3"]],
  },
  {
    label: "行の見出しの id が重複していれば、先の見出しだけで行を作る",
    actual: () => tableTopicIn(tableOf([head("r1", "一"), head("r2", "二"), head("r1", "三")], threeColumns, fullOutcomes())).rows.map((row) => row.head.label),
    expected: ["一", "二"],
  },
  {
    label: "列の見出しの id が重複していれば、先の見出しだけで列を作る",
    actual: () => tableTopicIn(tableOf(twoRows, [head("c1", "一"), head("c2", "二"), head("c1", "三"), head("c3", "四")], fullOutcomes())).columns.map((column) => column.label),
    expected: ["一", "二", "四"],
  },
  {
    label: "これまで(was)を持つマスだけが、変わったマスになる",
    actual: () => {
      const outcomes = fullOutcomes().map((item) => (item.result === "r1c2" || item.result === "r2c3" ? { ...item, was: "前" } : item));
      return gridOf(tableTopicIn(tableOf(twoRows, threeColumns, outcomes)), (outcome) => outcome.isChanged);
    },
    expected: [[false, true, false], [false, false, true]],
  },
  {
    label: "変わったマスの数は表ごとに数える",
    actual: () => {
      const unchanged = tableOf(twoRows, threeColumns, fullOutcomes());
      const changed = tableOf(twoRows, threeColumns, fullOutcomes().map((item) => (item.result.startsWith("r2") ? { ...item, was: "前" } : item)));
      return topicsOf(impactOf({ tables: [unchanged, changed] })).map((topic) => topic.changedCount);
    },
    expected: [0, 3],
  },
  {
    label: "マスに状況(situation)を書けば、見出しから組まずに書いた文をマスの状況にする",
    actual: () => tableTopicIn(tableOf([head("r", "タブなし", { note: "開始画面" })], [head("c", "開く操作なし")], [outcome("r", "c", "閉じる", { situation: "開始画面で、まだ何も開いていない" })])).rows[0].outcomes[0].situation,
    expected: "開始画面で、まだ何も開いていない",
  },
  {
    label: "マスに状況を書かず、行の見出しに注があれば、マスの状況は「行 · 列(注)」",
    actual: () => tableTopicIn(tableOf([head("r", "タブなし", { note: "開始画面" })], [head("c", "開く操作なし")], [outcome("r", "c", "閉じる")])).rows[0].outcomes[0].situation,
    expected: "タブなし · 開く操作なし(開始画面)",
  },
  {
    label: "マスに状況を書かず、行の見出しに注が無ければ、マスの状況は「行 · 列」",
    actual: () => tableTopicIn(tableOf([head("r", "タブあり")], [head("c", "開く操作なし")], [outcome("r", "c", "閉じる")])).rows[0].outcomes[0].situation,
    expected: "タブあり · 開く操作なし",
  },
  {
    label: "表で初めに選ぶマスは、行の順で最初の変わったマス",
    actual: () => ImpactTopics.firstCellOf(tableTopicIn(tableOf(twoRows, threeColumns, fullOutcomes().map((item) => (item.result === "r2c1" || item.result === "r1c3" ? { ...item, was: "前" } : item))))),
    expected: { row: "r1", column: "c3" },
  },
  {
    label: "変わったマスが無い表は、空きを飛ばした先頭のマスを初めに選ぶ",
    actual: () => ImpactTopics.firstCellOf(tableTopicIn(tableOf(twoRows, threeColumns, fullOutcomes().filter((item) => item.result !== "r1c1")))),
    expected: { row: "r1", column: "c2" },
  },
  {
    label: "マスが 1 つも無い表は、初めに選ぶマスが無い(null)",
    actual: () => ImpactTopics.firstCellOf(tableTopicIn(tableOf(twoRows, threeColumns, [outcome("r9", "c1", "迷子")]))),
    expected: null,
  },
  {
    label: "マスのテストは、テスト画面と同じテスト(同じ状態)を、書いた順に持つ",
    actual: () => {
      const result = explained(testedMap, testedExplain(impactOf({ tables: [tableOf([head("r", "行")], [head("c", "列")], [outcome("r", "c", "結果", { tests: ["b", "a"] })])] })));
      const verifying = result.impactTopics.topics[0].rows[0].outcomes[0].tests.verifying;
      return { listed: verifying.map((item) => [item.test.id, item.status]), isSame: verifying.every((item) => result.tests.includes(item)) };
    },
    expected: { listed: [["b", "old"], ["a", "new"]], isSame: true },
  },
  {
    label: "未実装のテストは確かめているテストに入れず、無いテストに分ける",
    actual: () => {
      const evidence = keptEvidenceOf(["t", "a"]);
      return { verifying: evidence.verifying.map((item) => item.test.id), missing: evidence.missing.map((item) => item.test.id) };
    },
    expected: { verifying: ["a"], missing: ["t"] },
  },
  {
    label: "解説のテストに無い id は、根拠のテストから外す",
    actual: () => {
      const evidence = keptEvidenceOf(["ghost", "a"]);
      return [...evidence.verifying, ...evidence.missing].map((item) => item.test.id);
    },
    expected: ["a"],
  },
  {
    label: "根拠のテストが追加のものだけなら、テストで守っている",
    actual: () => keptEvidenceOf(["a"]).isGuarded,
    expected: true,
  },
  {
    label: "根拠のテストが判定なしのものだけでも、テストで守っている",
    actual: () => keptEvidenceOf(["u"]).isGuarded,
    expected: true,
  },
  {
    label: "根拠のテストが未実装と既存なら、テストで守っている",
    actual: () => keptEvidenceOf(["t", "b"]).isGuarded,
    expected: true,
  },
  {
    label: "根拠のテストが未実装のものだけなら、この PR では未確認",
    actual: () => keptEvidenceOf(["t"]).isGuarded,
    expected: false,
  },
  {
    label: "根拠のテストが参照切れだけなら、この PR では未確認",
    actual: () => keptEvidenceOf(["ghost"]).isGuarded,
    expected: false,
  },
  {
    label: "変わったことの仕組みは、前の行から後の行へ、行が指すやりとりを書いた順に並べる",
    actual: () => mechanismIdsOf({ before: [{ text: "前", message: "m4" }], after: [{ text: "後 1", message: "m1" }, { text: "後 2", message: "m3" }] }),
    expected: ["m4", "m1", "m3"],
  },
  {
    label: "同じやりとりを指す行が 2 つあっても、仕組みには 1 つだけ並べる",
    actual: () => mechanismIdsOf({ before: [{ text: "前", message: "m3" }], after: [{ text: "後 1", message: "m1" }, { text: "後 2", message: "m3" }] }),
    expected: ["m3", "m1"],
  },
  {
    label: "解説のやりとりに無い id は、仕組みに入れない",
    actual: () => mechanismIdsOf({ before: [], after: [{ text: "後 1", message: "ghost" }, { text: "後 2", message: "m1" }] }),
    expected: ["m1"],
  },
  {
    label: "端が図の箱でないやりとり(地図に無いファイル・図に出さない concept)は「図に無い」",
    actual: () => {
      const topic = topicsOf(impactOf({ changed: { before: [], after: [{ text: "後 1", message: "m3" }, { text: "後 2", message: "m1" }, { text: "後 3", message: "m4" }] } }), mechanismExplain)[0];
      return topic.mechanisms.map((mechanism) => [mechanism.message.id, mechanism.isDrawn]);
    },
    expected: [["m3", false], ["m1", true], ["m4", false]],
  },
  {
    label: "受け手だけが図の箱のやりとり(図に出さない concept から箱へ)も「図に無い」",
    actual: () => topicsOf(impactOf({ changed: { before: [], after: [{ text: "後 1", message: "m5" }, { text: "後 2", message: "m1" }] } }), mechanismExplain)[0].mechanisms.map((mechanism) => [mechanism.message.id, mechanism.isDrawn]),
    expected: [["m5", false], ["m1", true]],
  },
  {
    label: "増えた状況の仕組みも、前後の行が指すやりとりを書いた順に並べる",
    actual: () => topicsOf(impactOf({ added: [{ label: "増えた", before: [{ text: "前", message: "m3" }], after: [{ text: "後", message: "m1" }] }] }), mechanismExplain)[0].mechanisms.map((mechanism) => mechanism.message.id),
    expected: ["m3", "m1"],
  },
  {
    label: "テストから、それを根拠に挙げている節(表ならマス、変わらないことなら行)を節の順に引く",
    actual: () => mentionedPlacesOf("a"),
    expected: [["table-0", { row: "r1", column: "c3" }, "一 · 三"], ["table-0", { row: "r2", column: "c1" }, "二 · 一"], ["added-0", null, null], ["kept", null, "変わらない 2"]],
  },
  {
    label: "未実装のテストから引いても、それを根拠に挙げている節を返す",
    actual: () => mentionedPlacesOf("t"),
    expected: [["table-0", { row: "r1", column: "c3" }, "一 · 三"], ["table-0", { row: "r2", column: "c1" }, "二 · 一"]],
  },
  {
    label: "振る舞いが書かれていない・解説が無いときは、テストから引いても何も返さない",
    actual: () => [ImpactTopics.mentionsOf({ kind: "unwritten" }, "a"), ImpactTopics.mentionsOf(ImpactTopics.Unexplained, "a")],
    expected: [[], []],
  },
  {
    label: "今の節は、上端が読む線(上端から 140px。140 を含む)より上に来た最後の節",
    actual: () => TopicScroll.currentOf([-400, 20, 140, 141]),
    expected: 2,
  },
  {
    label: "どの節の上端も読む線(140px)より下なら、今の節は最初の節",
    actual: () => TopicScroll.currentOf([200, 500, 900]),
    expected: 0,
  },
  {
    label: "節が無ければ、今の節は null",
    actual: () => TopicScroll.currentOf([]),
    expected: null,
  },
  {
    label: "primers がオブジェクトの解説は、理由を primers の型として解説なしにする",
    actual: () => shapeReasonOf({ primers: {} }),
    expected: { kind: "shape", key: "primers" },
  },
  {
    label: "primers の要素が null なら、理由は primers",
    actual: () => shapeReasonOf({ primers: [null] }),
    expected: { kind: "shape", key: "primers" },
  },
  {
    label: "出てくる場所(occurrences)がオブジェクトなら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ occurrences: {} })] }),
    expected: { kind: "shape", key: "primers[].occurrences" },
  },
  {
    label: "段の文(passages の text)が数値なら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ passages: [{ kind: "text", text: 5 }] })] }),
    expected: { kind: "shape", key: "primers[].passages[].text" },
  },
  {
    label: "節の題(label)が数値なら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ label: 5 })] }),
    expected: { kind: "shape", key: "primers[].label" },
  },
  {
    label: "出てくる場所の shas の要素が数値なら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ occurrences: [{ path: "a.ts", text: "ここ", shas: [5] }] })] }),
    expected: { kind: "shape", key: "primers[].occurrences[].shas" },
  },
  {
    label: "節の題(label)が無ければ、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ id: "a" }), { ...primerOf({ id: "b" }), label: undefined }] }),
    expected: { kind: "shape", key: "primers[].label" },
  },
  {
    label: "用語の意味(terms の text)が無ければ、理由はその道筋",
    actual: () => shapeReasonOf({ terms: [termOf("t1"), { id: "t2", label: "語" }] }),
    expected: { kind: "shape", key: "terms[].text" },
  },
  {
    label: "引数の段の引数の文が無ければ、理由はその道筋(段の kind ごとのキーでも、そのオブジェクトで必須なら見る)",
    actual: () => shapeReasonOf({ primers: [primerOf({ passages: [{ kind: "parameters", parameters: [{ name: "a", type: "T" }] }] })] }),
    expected: { kind: "shape", key: "primers[].passages[].parameters[].text" },
  },
  {
    label: "段の文は、宣言(declaration)の段に無くても欠けとしない(その kind では必須でない)",
    actual: () => explained(mapOf(), explainOf({ primers: [primerOf({ passages: [{ kind: "declaration", code: "f()" }] })] })).reading.kind,
    expected: "explained",
  },
  {
    label: "抜粋(excerpt)の段に抜粋のオブジェクトが無ければ、解説なしにして理由をその道筋にする",
    actual: () => explained(mapOf(), explainOf({ primers: [primerOf({ passages: [{ kind: "excerpt" }] })] })).reading,
    expected: { kind: "missing", reason: { kind: "shape", key: "primers[].passages[].excerpt" } },
  },
  {
    label: "抜粋のオブジェクトは、宣言・引数の段に無くても欠けとしない(その kind では必須でない)",
    actual: () => explained(mapOf(), explainOf({ primers: [primerOf({ passages: [{ kind: "declaration", code: "f()" }, { kind: "parameters", parameters: [{ name: "a", type: "T", text: "文" }] }] })] })).reading.kind,
    expected: "explained",
  },
  {
    label: "型の違いと必須の欠けが同時にあれば、外側の欠け(節の題)を理由にする",
    actual: () => shapeReasonOf({ primers: [{ ...primerOf({ passages: [{ kind: "text", text: 5 }] }), label: undefined }] }),
    expected: { kind: "shape", key: "primers[].label" },
  },
  {
    label: "型の違いと必須の欠けが同時にあれば、外側の型の違い(節の題)を理由にする",
    actual: () => shapeReasonOf({ primers: [primerOf({ label: 5, passages: [{ kind: "text" }] })] }),
    expected: { kind: "shape", key: "primers[].label" },
  },
  {
    label: "任意の文(引数の注 note)が無くても、解説は使える",
    actual: () => explained(mapOf(), explainOf({ primers: [primerOf({ passages: [{ kind: "parameters", parameters: [{ name: "a", type: "T", text: "文" }] }] })] })).reading.kind,
    expected: "explained",
  },
  {
    label: "用語の意味(terms の text)が数値なら、理由はその道筋",
    actual: () => shapeReasonOf({ terms: [{ id: "t", label: "語", text: 5 }] }),
    expected: { kind: "shape", key: "terms[].text" },
  },
  {
    label: "振る舞いの文(impact の kept の text)が数値でも、解説は使える",
    actual: () => explained(mapOf(), explainOf({ impact: impactOf({ kept: [{ text: 5 }] }) })).reading.kind,
    expected: "explained",
  },
  {
    label: "passages がオブジェクトなら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ passages: {} })] }),
    expected: { kind: "shape", key: "primers[].passages" },
  },
  {
    label: "段の抜粋の強調(emphasis)がオブジェクトなら、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ passages: [passageExcerpt({ emphasis: {} })] })] }),
    expected: { kind: "shape", key: "primers[].passages[].excerpt.emphasis" },
  },
  {
    label: "テストの抜粋の強調の要素がオブジェクトでなければ、理由はその道筋",
    actual: () => shapeReasonOf({ suites: [suite("s", "s.test.ts")], tests: [test("a", "s", "名", { excerpt: { path: "a.ts", start: 1, end: 1, emphasis: [null] } })] }),
    expected: { kind: "shape", key: "tests[].excerpt.emphasis" },
  },
  {
    label: "段の抜粋の強調の要素がオブジェクトでなければ、理由はその道筋",
    actual: () => shapeReasonOf({ primers: [primerOf({ passages: [passageExcerpt({ emphasis: [null] })] })] }),
    expected: { kind: "shape", key: "primers[].passages[].excerpt.emphasis" },
  },
  {
    label: "段の抜粋の強調の start / end が数でなくても解説は使え、その抜粋の行は番号どおりに並ぶ",
    actual: () => {
      const emphasis = [{ start: "a", end: null }];
      const reading = explained(mapOf(), explainOf({ primers: [primerOf({ passages: [passageExcerpt({ emphasis })] })] })).reading.kind;
      return [reading, ExcerptRows.create({ path: "a.ts", start: 10, end: 14, emphasis, text: "a\nb\nc\nd\ne" }).map((row) => row.number)];
    },
    expected: ["explained", [10, 11, 12, 13, 14]],
  },
  {
    label: "技術の手引きのタブ(Primer の kind)は、解説の検査の Primer の kind と同じ",
    actual: () => Object.values(PrimerTopics.PrimerKinds),
    expected: checkerPrimerKinds,
  },
  {
    label: "ページが描く段の kind は、解説の検査の Passage の kind と同じ並び",
    actual: () => PrimerTopics.PassageKinds,
    expected: checkerPassageKinds,
  },
  {
    label: "用語の印の綴りは、解説の検査と同じ",
    actual: () => TermMarks.Pattern.source,
    expected: checkerTermMarkPattern,
  },
  {
    label: "閉じていない `` ` `` のある文は、解説の検査と同じに割る(最後の `` ` `` は文字のまま前の切れ端につなぐ)",
    actual: () => CodeSpans.create("前 `a` 中 `b").map((span) => [span.isCode, span.text]),
    expected: checkerCodeSpans["前 `a` 中 `b"],
  },
  {
    label: "対になった `` ` `` だけの文は、解説の検査と同じに割る(空の切れ端も出す)",
    actual: () => CodeSpans.create("``a`` `b`").map((span) => [span.isCode, span.text]),
    expected: checkerCodeSpans["``a`` `b`"],
  },
  {
    label: "用語の印を読む道筋は、解説の検査が MarkedText の規則を付けた道筋と同じ並び",
    actual: () => TermMarks.Routes,
    expected: checkerMarkedRoutes,
  },
  {
    label: "解説が無いとき、技術の手引きは「解説なし」",
    actual: () => ExplainedMap.create(mapOf(), absent).primerTopics,
    expected: { kind: "none" },
  },
  {
    label: "退けた解説(pr が違う)は、primers が書いてあっても技術の手引きは「解説なし」",
    actual: () => primerTopicsOf({ pr: Pr + 1, primers: [primerOf()] }),
    expected: { kind: "none" },
  },
  {
    label: "primers が無ければ、impact があっても技術の手引きは「書かれていない」",
    actual: () => primerTopicsOf({ impact: impactOf({ kept: [{ text: "変わらない" }] }) }),
    expected: { kind: "unwritten" },
  },
  {
    label: "primers が空でも、技術の手引きは「書かれていない」",
    actual: () => primerTopicsOf({ primers: [] }),
    expected: { kind: "unwritten" },
  },
  {
    label: "言語と実装の節を交互に書くと、タブごとに書いた順で分かれる",
    actual: () => {
      const primers = [primerOf({ id: "a" }), primerOf({ id: "b", kind: "codebase" }), primerOf({ id: "c" }), primerOf({ id: "d", kind: "codebase" })];
      const tabs = primerTopicsOf({ primers }).tabs;
      return [tabs.language.topics.map((topic) => topic.id), tabs.codebase.topics.map((topic) => topic.id)];
    },
    expected: [["a", "c"], ["b", "d"]],
  },
  {
    label: "節の用語は、要するに → 段を書いた順(段の中は文 → 引数)の文書の順に並び、JSON のキーの順にも terms の順にもよらない",
    actual: () => {
      const primer = {
        kind: "language",
        id: "p",
        category: "分類",
        label: "題",
        occurrences: [{ path: "a.ts", text: "ここ" }],
        passages: [{ kind: "parameters", parameters: [{ name: "n", type: "T", text: "[[二|t2]]" }] }, { kind: "text", text: "[[一|t1]] と [[三|t3]]" }],
        gist: "[[三|t3]]",
      };
      return tabTopicsOf({ primers: [primer], terms: [termOf("t1"), termOf("t2"), termOf("t3")] }, "language")[0].terms.map((term) => term.id);
    },
    expected: ["t3", "t2", "t1"],
  },
  {
    label: "用語集は、タブの節をまたいで最初に出た順に並び、印の無いタブは null",
    actual: () => {
      const primers = [primerOf({ id: "a", gist: "[[二|t2]]" }), primerOf({ id: "b", kind: "codebase" }), primerOf({ id: "c", gist: "[[一|t1]] と [[二|t2]]" })];
      const tabs = primerTopicsOf({ primers, terms: [termOf("t1"), termOf("t2")] }).tabs;
      return [tabs.language.glossary.terms.map((term) => term.id), tabs.codebase.glossary];
    },
    expected: [["t2", "t1"], null],
  },
  {
    label: "terms に無い印は表示の文字のままになり、節の用語にも用語集にも入らない",
    actual: () => {
      const topic = primerTopicsOf({ primers: [primerOf({ gist: "[[一|t1]] と [[無い|ghost]]" })], terms: [termOf("t1", "一")] }).tabs.language;
      return { gist: topic.topics[0].gist, terms: topic.topics[0].terms.map((term) => term.id), glossary: topic.glossary.terms.map((term) => term.id) };
    },
    expected: {
      gist: [{ kind: "term", label: "一", term: { id: "t1", label: "一", text: "一の意味" } }, { kind: "plain", text: " と " }, { kind: "plain", text: "無い" }],
      terms: ["t1"],
      glossary: ["t1"],
    },
  },
  {
    label: "関連は書いた順に、指した先のタブ・タブの中の位置・題になる",
    actual: () => {
      const primers = [primerOf({ id: "a", seeAlso: ["d", "b"] }), primerOf({ id: "c", kind: "codebase", label: "C" }), primerOf({ id: "b", label: "B" }), primerOf({ id: "d", kind: "codebase", label: "D" })];
      return tabTopicsOf({ primers }, "language")[0].seeAlso;
    },
    expected: [{ tab: "codebase", index: 1, label: "D" }, { tab: "language", index: 1, label: "B" }],
  },
  {
    label: "primers に無い関連の id は外す",
    actual: () => tabTopicsOf({ primers: [primerOf({ id: "a", seeAlso: ["ghost", "b"] }), primerOf({ id: "b", label: "B" })] }, "language")[0].seeAlso,
    expected: [{ tab: "language", index: 1, label: "B" }],
  },
  {
    label: "この PR の実装の節の状態は、added / changed / 省略 → added / changed / 前からある(Existing)",
    actual: () => tabTopicsOf({ primers: [primerOf({ id: "a", kind: "codebase", status: "added" }), primerOf({ id: "b", kind: "codebase", status: "changed" }), primerOf({ id: "c", kind: "codebase" })] }, "codebase").map((topic) => topic.status),
    expected: ["added", "changed", "existing"],
  },
  {
    label: "前からある(Existing)の綴りは、解説の検査の技術の節の状態と重ならない",
    actual: () => Object.hasOwn(Vocabulary.primerStatuses, PrimerTopics.Existing),
    expected: false,
  },
  {
    label: "言語・フレームワークの節は状態を持たない(札なし)",
    actual: () => tabTopicsOf({ primers: [primerOf()] }, "language").map((topic) => topic.status),
    expected: [null],
  },
  {
    label: "この PR の実装の節のテストは、未実装を無いテストに分け、解説のテストに無い id は外す",
    actual: () => {
      const tests = explained(testedMap, { ...testedExplain(undefined), primers: [primerOf({ kind: "codebase", tests: ["t", "ghost", "a"] })] }).primerTopics.tabs.codebase.topics[0].tests;
      return { verifying: tests.verifying.map((item) => item.test.id), missing: tests.missing.map((item) => item.test.id) };
    },
    expected: { verifying: ["a"], missing: ["t"] },
  },
  {
    label: "この PR の実装の節の流れは、書いた順に引き、解説の流れに無い id は外す",
    actual: () => {
      const flows = [{ id: "f1", label: "一", steps: ["m"] }, { id: "f2", label: "二", steps: ["m"] }];
      return tabTopicsOf({ flows, primers: [primerOf({ kind: "codebase", flows: ["f2", "ghost", "f1"] })] }, "codebase")[0].flows.map((flow) => flow.id);
    },
    expected: ["f2", "f1"],
  },
  {
    label: "最初に開くタブは、言語に節があれば言語、無くて実装にあれば実装、どちらにも無ければ言語",
    actual: () => [
      [primerOf({ id: "b", kind: "codebase" }), primerOf({ id: "a" })],
      [primerOf({ id: "b", kind: "codebase" })],
      [primerOf({ id: "x", kind: "framework" })],
    ].map((primers) => PrimerTopics.firstTabOf(primerTopicsOf({ primers }))),
    expected: ["language", "codebase", "language"],
  },
  {
    label: "出てくる場所の行の範囲を省けば null、shas を省けば届く先は無い",
    actual: () => tabTopicsOf({ primers: [primerOf()] }, "language")[0].occurrences,
    expected: [{ path: "a.ts", lineRange: null, text: "ここ", destinations: [] }],
  },
  {
    label: "段は書いた順にそろえ、知らない kind の段は外す",
    actual: () => {
      const passages = [{ kind: "text", text: "前" }, passageExcerpt(), { kind: "figure", text: "図" }, { kind: "caution", text: "注意" }, { kind: "text", text: "後" }];
      return tabTopicsOf({ primers: [primerOf({ passages })] }, "language")[0].passages.map((passage) => passage.kind);
    },
    expected: ["text", "excerpt", "remark", "text"],
  },
  {
    label: "注意(caution)とメモ(memo)の段は、それぞれの種類を色分けの鍵として持つ",
    actual: () => tabTopicsOf({ primers: [primerOf({ passages: [{ kind: "caution", text: "注意" }, { kind: "memo", text: "メモ" }] })] }, "language")[0].passages.map((passage) => [passage.label, passage.remark]),
    expected: [["注意", "caution"], ["メモ", "memo"]],
  },
  {
    label: "用語の印は、前後の文字と印に割れ、文の先頭・末尾の印の外に空の文字を出さない",
    actual: () => [TermMarks.piecesOf("前[[絞り込まれ|narrowing]]ます"), TermMarks.piecesOf("[[絞り込み|narrowing]]")],
    expected: [
      [{ kind: "plain", text: "前" }, { kind: "term", label: "絞り込まれ", id: "narrowing" }, { kind: "plain", text: "ます" }],
      [{ kind: "term", label: "絞り込み", id: "narrowing" }],
    ],
  },
  {
    label: "印の表示のバッククォートは、そのまま表示に残る",
    actual: () => TermMarks.piecesOf("[[`Some`|some]]"),
    expected: [{ kind: "term", label: "`Some`", id: "some" }],
  },
  {
    label: "id に空白がある・表示が空の二重の角括弧は印にならず、文字 1 つのまま",
    actual: () => [TermMarks.piecesOf("[[a|b c]]"), TermMarks.piecesOf("[[|b]]")],
    expected: [[{ kind: "plain", text: "[[a|b c]]" }], [{ kind: "plain", text: "[[|b]]" }]],
  },
  {
    label: "印の直前の角括弧 1 つは、印の外の文字になる",
    actual: () => TermMarks.piecesOf("[[[a|b]]"),
    expected: [{ kind: "plain", text: "[" }, { kind: "term", label: "a", id: "b" }],
  },
  {
    label: "届く先は shas を書いた順で、解説の sha までにそのファイルを最後に変えたコミットだけが行まで届く",
    actual: () => reachesOf({ commits: threeCommits, explainedSha: shaOf(3), path: "a.ts", shas: [shaOf(2), shaOf(1)] }),
    expected: [[shaOf(2), lineReach], [shaOf(1), { kind: "file" }]],
  },
  {
    label: "解説の sha より後のコミットには、行まで届かない",
    actual: () => reachesOf({ commits: threeCommits, explainedSha: shaOf(1), path: "a.ts", shas: [shaOf(1), shaOf(2)] }),
    expected: [[shaOf(1), lineReach], [shaOf(2), { kind: "file" }]],
  },
  {
    label: "後のコミットがファイルを別のパスへ移したら、移す前のパスのコミットはファイルまで、移した後のパスは行まで届く",
    actual: () => [
      reachesOf({ commits: renamedCommits, explainedSha: shaOf(2), path: "a.ts", shas: [shaOf(1)] }),
      reachesOf({ commits: renamedCommits, explainedSha: shaOf(2), path: "z.ts", shas: [shaOf(2)] }),
    ],
    expected: [[[shaOf(1), { kind: "file" }]], [[shaOf(2), lineReach]]],
  },
  {
    label: "地図に無い sha は unmapped、行の範囲が無ければ file、解説の sha が地図に無ければ最後に変えたコミットも file",
    actual: () => [
      reachesOf({ commits: threeCommits, explainedSha: shaOf(3), path: "a.ts", shas: [shaOf(8)] }),
      reachesOf({ commits: threeCommits, explainedSha: shaOf(3), path: "a.ts", shas: [shaOf(2)], lineRange: null }),
      reachesOf({ commits: threeCommits, explainedSha: shaOf(8), path: "a.ts", shas: [shaOf(2)] }),
    ],
    expected: [[[shaOf(8), { kind: "unmapped" }]], [[shaOf(2), { kind: "file" }]], [[shaOf(2), { kind: "file" }]]],
  },
  {
    label: "あいだ(解説の sha を含む)にマージコミットがあれば、最後に変えたコミットでも行まで届かない",
    actual: () => reachesOf({ commits: mergedCommits, explainedSha: shaOf(2), path: "a.ts", shas: [shaOf(1)] }),
    expected: [[shaOf(1), { kind: "file" }]],
  },
  {
    label: "あいだのコミットがほかのファイルだけを変えたなら、行まで届く",
    actual: () => reachesOf({ commits: [commitTouching(1, [diffFile("a.ts")]), commitTouching(2, [diffFile("b.ts")])], explainedSha: shaOf(2), path: "a.ts", shas: [shaOf(1)] }),
    expected: [[shaOf(1), lineReach]],
  },
  {
    label: "そのパスのファイルを変えていないコミットは、地図にあっても untouched",
    actual: () => reachesOf({ commits: renamedCommits, explainedSha: shaOf(2), path: "z.ts", shas: [shaOf(1)] }),
    expected: [[shaOf(1), { kind: "untouched" }]],
  },
  {
    label: "マージコミットの sha は merge",
    actual: () => reachesOf({ commits: mergedCommits, explainedSha: shaOf(2), path: "a.ts", shas: [shaOf(2)] }),
    expected: [[shaOf(2), { kind: "merge" }]],
  },
  {
    label: "抜粋の行はファイルの行番号で並び、強調の範囲に入る行だけが強調になり、強調を省けばどの行も強調しない",
    actual: () => {
      const excerpt = { path: "a.ts", start: 10, end: 14, text: "a\nb\nc\nd\ne" };
      const rows = ExcerptRows.create({ ...excerpt, emphasis: [{ start: 11, end: 11 }, { start: 13, end: 14 }] });
      return { numbers: rows.map((row) => row.number), emphasized: rows.map((row) => row.isEmphasized), plain: ExcerptRows.create(excerpt).map((row) => row.isEmphasized) };
    },
    expected: { numbers: [10, 11, 12, 13, 14], emphasized: [false, true, false, true, true], plain: [false, false, false, false, false] },
  },
  {
    label: "色分け: Rust の宣言・制御・修飾はキーワードになる",
    actual: () => ["pub", "fn", "impl", "enum", "struct", "match", "let", "mut", "use", "trait", "where", "return"].map((word) => colorOf("value.rs", [word], { word })),
    expected: Array(12).fill("tok-kw"),
  },
  {
    label: "色分け: Rust の型・呼び出し・数値・コメントを区別する",
    actual: () => {
      const tokens = lineTokensOf("value.rs", ["let value: u32 = parse(42); // value"]);
      return ["value", "u32", "parse", "42", "// value"].map((word) => colorIn(tokens, 0, word));
    },
    expected: ["tok-var", "tok-type", "tok-fn", "tok-num", "tok-com"],
  },
  {
    label: "色分け: .swift の宣言・制御・修飾の語はキーワードになる",
    actual: () => ["import", "struct", "enum", "protocol", "extension", "func", "let", "var", "guard", "else", "return", "switch", "case", "private", "mutating", "nonisolated", "async", "await", "throws", "some"].map((word) => colorOf("ProductFormView.swift", [word], { word })),
    expected: Array(20).fill("tok-kw"),
  },
  {
    label: "色分け: Swift の型・変数・呼び出し・数値・nil・真偽値を区別する",
    actual: () => {
      const tokens = lineTokensOf("a.swift", ["let value: Product? = create(42, nil, true, false)"]);
      return ["value", "Product", "create", "42", "nil", "true", "false"].map((word) => colorIn(tokens, 0, word));
    },
    expected: ["tok-var", "tok-type", "tok-fn", "tok-num", "tok-kw", "tok-kw", "tok-kw"],
  },
  {
    label: "色分け: Swift の属性・マクロ・条件付きコンパイルは @ と # を含めてキーワードになる",
    actual: () => ["@State", "@MainActor", "@Environment", "@Test", "#expect", "#Preview", "#if", "#elseif", "#else", "#endif"].map((word) => colorOf("a.swift", [`${word}(value)`], { word })),
    expected: Array(10).fill("tok-kw"),
  },
  {
    label: "色分け: Swift の通常文字列では属性・マクロ・コメント記号を読まない",
    actual: () => lineTokensOf("a.swift", ['"@State #expect // nil"'])[0].map((token) => [token.cls, token.value]),
    expected: [["tok-str", '"@State #expect // nil"']],
  },
  {
    label: "色分け: Swift の行コメントでは属性・マクロ・文字列を読まない",
    actual: () => lineTokensOf("a.swift", ['// @State #expect "nil"'])[0].map((token) => [token.cls, token.value]),
    expected: [["tok-com", '// @State #expect "nil"']],
  },
  {
    label: "色分け: Swift のブロックコメントは行をまたぎ、閉じた後はコードへ戻る",
    actual: () => {
      const tokens = lineTokensOf("a.swift", ["/* @State", "#expect(true)", "*/ let value = false"]);
      return [tokens[1].map((token) => [token.cls, token.value]), colorIn(tokens, 2, "let"), colorIn(tokens, 2, "false")];
    },
    expected: [[["tok-com", "#expect(true)"]], "tok-kw", "tok-kw"],
  },
  {
    label: "色分け: Swift の三重引用符は行をまたぎ、閉じた後はコードへ戻る",
    actual: () => {
      const tokens = lineTokensOf("a.swift", ['let text = """', "@State #expect // nil", '""" let value = true']);
      return [tokens[1].map((token) => [token.cls, token.value]), colorIn(tokens, 2, "let"), colorIn(tokens, 2, "true")];
    },
    expected: [[["tok-str", "@State #expect // nil"]], "tok-kw", "tok-kw"],
  },
  {
    label: "色分け: Swift の抜粋も属性・修飾・宣言・型を色分けする",
    actual: () => {
      const rows = ExcerptRows.create({ path: "ProductFormView.swift", start: 10, end: 10, text: "@State private var draft: ProductDraft" });
      return ["@State", "private", "var", "draft", "ProductDraft"].map((word) => colorIn(rows.map((row) => row.tokens), 0, word));
    },
    expected: ["tok-kw", "tok-kw", "tok-kw", "tok-var", "tok-type"],
  },
  {
    label: "色分け: Swift のコミット差分は削除行と追加行の両方に色が付く",
    actual: () => {
      const patch = linesOf(["@@ -1,1 +1,1 @@", "-@MainActor let old: Bool = true", "+@State var count = 42"]);
      const [file] = diffOf([diffFile("a.swift", { patch })], []).files;
      const tokens = CommitDiff.lineTokensOf(file.body.hunks[0], Tokenizer.grammarOf(file.path));
      return [["@MainActor", "let", "Bool", "true"].map((word) => colorIn(tokens, 0, word)), ["@State", "var", "count", "42"].map((word) => colorIn(tokens, 1, word))];
    },
    expected: [["tok-kw", "tok-kw", "tok-type", "tok-kw"], ["tok-kw", "tok-kw", "tok-var", "tok-num"]],
  },
  {
    label: "色分け: Swift 専用の語と記号の規則は JS・TS・Python へ漏れない",
    actual: () => {
      const ts = lineTokensOf("a.ts", ["@State #expect(value); let nil = 1;"]);
      return [colorIn(ts, 0, "nil"), ts[0].some((token) => token.value === "@State" || token.value === "#expect"), colorOf("a.js", ["const guard = 1;"], { word: "guard" }), lineTokensOf("a.py", ["#expect(value)"])[0].map((token) => [token.cls, token.value])];
    },
    expected: ["tok-var", false, "tok-var", [["tok-com", "#expect(value)"]]],
  },
  {
    label: "色分け: .ts では TS の語(satisfies)もキーワードになる",
    actual: () => colorOf("a.ts", ["const a = b satisfies C;"], { word: "satisfies" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .tsx も TS の規則で読む(satisfies がキーワード)",
    actual: () => colorOf("a.tsx", ["const a = b satisfies C;"], { word: "satisfies" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .js では type はキーワードにならず変数になる",
    actual: () => colorOf("a.js", ["const type = 1;"], { word: "type" }),
    expected: "tok-var",
  },
  {
    label: "色分け: .css のファイルは CSS の規則で読む(@media がキーワード)",
    actual: () => colorOf("a.css", ["@media (x) {"], { word: "@media" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .md と .unknown は規則が無く、行全体が色の無い 1 字句になる",
    actual: () => ["a.md", "a.unknown"].map((path) => lineTokensOf(path, ["const a = f(1);"])[0].map((token) => [token.cls, token.value])),
    expected: [[[null, "const a = f(1);"]], [[null, "const a = f(1);"]]],
  },
  {
    label: "色分け: JS / TS の大文字で始まる名前は型になる",
    actual: () => colorOf("a.ts", ["const a: TauriIpc = b;"], { word: "TauriIpc" }),
    expected: "tok-type",
  },
  {
    label: "色分け: JS / TS の「名前(」は関数になる",
    actual: () => colorOf("a.ts", ["create(a);"], { word: "create" }),
    expected: "tok-fn",
  },
  {
    label: "色分け: . の後の名前は、キーワードの綴りでも色を付けない",
    actual: () => colorOf("a.ts", ["a.from;"], { word: "from" }),
    expected: null,
  },
  {
    label: "色分け: . の後でも、呼び出しなら関数になる",
    actual: () => colorOf("a.ts", ["a.map(f);"], { word: "map" }),
    expected: "tok-fn",
  },
  {
    label: "色分け: 呼び出しでもメンバーでもキーでもない小文字の名前は変数になる",
    actual: () => colorOf("a.ts", ["return total;"], { word: "total" }),
    expected: "tok-var",
  },
  {
    label: "色分け: スプレッドの ... の後の名前は、メンバーにせず変数にする",
    actual: () => colorOf("a.ts", ["f(...rest);"], { word: "rest" }),
    expected: "tok-var",
  },
  {
    label: "色分け: .ts のオブジェクトのキーは、キーワードの綴りでも色を付けない",
    actual: () => colorOf("a.ts", ['const s = { type: "x" };'], { word: "type" }),
    expected: null,
  },
  {
    label: "色分け: { default: 1 } の default もキーとして色を付けない",
    actual: () => colorOf("a.ts", ["const s = { default: 1 };"], { word: "default" }),
    expected: null,
  },
  {
    label: "色分け: a?: もキーとして色を付けない",
    actual: () => colorOf("a.ts", ["type S = { a?: string };"], { word: "a" }),
    expected: null,
  },
  {
    label: "色分け: 1 行の型リテラルで ; の後の b: もキーとして色を付けない",
    actual: () => colorOf("a.ts", ["type A = { a: string; b: number };"], { word: "b" }),
    expected: null,
  },
  {
    label: "色分け: readonly の後の name: もキーとして色を付けない",
    actual: () => colorOf("a.ts", ["interface A { readonly name: string }"], { word: "name" }),
    expected: null,
  },
  {
    label: "色分け: 「if(」の if は関数にならずキーワードのまま",
    actual: () => colorOf("a.ts", ["if(x) {}"], { word: "if" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 丸括弧の中の name: は変数になる",
    actual: () => colorOf("a.ts", ["const f = (state: State) => state;"], { word: "state" }),
    expected: "tok-var",
  },
  {
    label: "色分け: 前の行で開いた丸括弧の中の name: も変数になる",
    actual: () => colorOf("a.ts", ["f(", "  state: State,", ");"], { line: 1, word: "state" }),
    expected: "tok-var",
  },
  {
    label: "色分け: 前の行で開いた波括弧の中の name: はキーになる",
    actual: () => colorOf("a.ts", ["const s = {", "  state: 1,", "};"], { line: 1, word: "state" }),
    expected: null,
  },
  {
    label: "色分け: 大文字で始まるキーも型にしない",
    actual: () => colorOf("a.ts", ['const s = { Map: "map" };'], { word: "Map" }),
    expected: null,
  },
  {
    label: "色分け: const / let / var の直後の name: は変数になる",
    actual: () => colorOf("a.ts", ["const x: Foo = y;"], { word: "x" }),
    expected: "tok-var",
  },
  {
    label: "色分け: 三項演算子の ? の後の name : は変数になる",
    actual: () => colorOf("a.ts", ["const v = ok ? left : right;"], { word: "left" }),
    expected: "tok-var",
  },
  {
    label: "色分け: 種類の合わない閉じ括弧は外側の括弧を閉じない(文字クラスの } の後でも、波括弧の中の key: はキー)",
    actual: () => colorOf("a.ts", ["f({ re: /[}]/, key: 1 })"], { word: "key" }),
    expected: null,
  },
  {
    label: "色分け: Python の else: はキーワードのまま(キーの規則は JS / TS だけ)",
    actual: () => colorOf("a.py", ["else:"], { word: "else" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: Python の f\"…\" の f は文字列に含まれる",
    actual: () => colorOf("a.py", ['x = f"a{b}"'], { word: 'f"a{b}"' }),
    expected: "tok-str",
  },
  {
    label: "色分け: Python の dict は型になる",
    actual: () => colorOf("a.py", ["x: dict = {}"], { word: "dict" }),
    expected: "tok-type",
  },
  {
    label: "色分け: Python の str(x) の str は関数になる",
    actual: () => colorOf("a.py", ["y = str(x)"], { word: "str" }),
    expected: "tok-fn",
  },
  {
    label: "色分け: CSS の /* */ はコメントで、中の 12px も数値にならない",
    actual: () => lineTokensOf("a.css", ["/* 12px */"])[0].map((token) => token.cls),
    expected: ["tok-com"],
  },
  {
    label: "色分け: CSS の @media はキーワードになる",
    actual: () => colorOf("a.css", ["@media screen {"], { word: "@media" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: CSS の --x は変数になる",
    actual: () => colorOf("a.css", ["a { color: var(--x); }"], { word: "--x" }),
    expected: "tok-var",
  },
  {
    label: "色分け: CSS の display: はキーになる",
    actual: () => colorOf("a.css", ["a { display: block; }"], { word: "display" }),
    expected: "tok-key",
  },
  {
    label: "色分け: CSS の var( は関数になる",
    actual: () => colorOf("a.css", ["a { color: var(--x); }"], { word: "var" }),
    expected: "tok-fn",
  },
  {
    label: "色分け: CSS の 12px と #1F6F8B は数値になる",
    actual: () => ["12px", "#1F6F8B"].map((word) => colorOf("a.css", ["a { width: 12px; color: #1F6F8B; }"], { word })),
    expected: ["tok-num", "tok-num"],
  },
  {
    label: "色分け: CSS の a:hover { の a はキーにならない",
    actual: () => colorOf("a.css", ["a:hover {"], { word: "a" }),
    expected: null,
  },
  {
    label: "色分け: CSS の行末が , のセレクタ(a:hover,)の a もキーにならない",
    actual: () => colorOf("a.css", ["a:hover,"], { word: "a" }),
    expected: null,
  },
  {
    label: "色分け: CSS の @media (max-width: …) の max-width はキーにならない",
    actual: () => colorOf("a.css", ["@media (max-width: 10px) {"], { word: "max-width" }),
    expected: null,
  },
  {
    label: "色分け: CSS の : の後に空白の無い宣言も、後ろで最初に来る { ; } が ; か } ならキーになる(color:red; と a{color:red} の color)",
    actual: () => [["color:red;"], ["a{color:red}"]].map((lines) => colorOf("a.css", lines, { word: "color" })),
    expected: ["tok-key", "tok-key"],
  },
  {
    label: "色分け: CSS の : の後が空白なら、後ろに ; も } も無くても宣言としてキーになる(行末に ; の無い color: red の color)",
    actual: () => colorOf("a.css", ["  color: red"], { word: "color" }),
    expected: "tok-key",
  },
  {
    label: "色分け: CSS の 1 行に宣言とセレクタが並んでも、語ごとにその後ろを見る(a{top:0} b:hover{ の top はキーで、b はキーにならない)",
    actual: () => ["top", "b"].map((word) => colorOf("a.css", ["a{top:0} b:hover{"], { word })),
    expected: ["tok-key", null],
  },
  {
    label: "色分け: script 要素の開きタグの後ろは JS で読む(同じ行の const がキーワード)",
    actual: () => colorOf("a.html", ["<script>const a = 1;"], { word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: script 要素の閉じタグの後ろは HTML に戻る(同じ行の後ろの const は色なし)",
    actual: () => colorOf("a.html", ["<script>x</script> const"], { word: "const" }),
    expected: null,
  },
  {
    label: "色分け: style 要素の開きタグの後ろは CSS で読む(color: がキー)",
    actual: () => colorOf("a.html", ["<style>a { color: red; }"], { word: "color" }),
    expected: "tok-key",
  },
  {
    label: "色分け: script 要素の開きタグの次の行の const もキーワードになる(行をまたいで持ち越す)",
    actual: () => colorOf("a.html", ["<script>", "const a = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: script 要素の中の文字列の style 要素の開きタグでは CSS に切り替わらない(後ろの const がキーワードのまま)",
    actual: () => colorOf("a.html", ['<script>const s = "<style>"; const b = 1;'], { word: "const", nth: 1 }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 大文字の SCRIPT の開きタグと Script の閉じタグも、大文字小文字を問わず切り替える",
    actual: () => [0, 1].map((nth) => colorOf("a.html", ["<SCRIPT>const a = 1;</Script> const"], { word: "const", nth })),
    expected: ["tok-kw", null],
  },
  {
    label: "色分け: 長い行の途中にある script 要素の閉じタグで HTML に戻る(閉じタグの前の最後の const はキーワード、後ろの const は色なし)",
    actual: () => [499, 500].map((nth) => colorOf("a.html", [`<script>${"const a = 1; ".repeat(500)}</script> const`], { word: "const", nth })),
    expected: ["tok-kw", null],
  },
  {
    label: "色分け: 行末の script 要素の閉じタグで閉じると、次の行は HTML で読む(const は色なし)",
    actual: () => colorOf("a.html", ["<script>const a = 1;</script>", "const"], { line: 1, word: "const" }),
    expected: null,
  },
  {
    label: "色分け: script 要素の閉じタグの無い長い行は、行末まで JS で読む(行末の const もキーワード)",
    actual: () => colorOf("a.html", [`<script>${"a = 1; ".repeat(500)}const`], { word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 閉じタグの後に同じ行で開き直した script 要素は、その後ろの閉じタグで閉じる(間の const はキーワード、後ろの const は色なし)",
    actual: () => [0, 1].map((nth) => colorOf("a.html", ["a = 1;</script><script>const b = 2;</script> const"], { word: "const", nth, openingLine: "<script>" })),
    expected: ["tok-kw", null],
  },
  {
    label: "色分け: script 要素の中で閉じていない /* は、閉じタグで HTML に戻ると捨てる(次の行の <b はキーワード)",
    actual: () => colorOf("a.html", ["<script>/* a</script><p>", "<b>x</b>"], { line: 1, word: "<b" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JS のヒアドキュメントの次の行から区切りの行までは JS で読む(const がキーワード)",
    actual: () => colorOf("a.sh", ["cat <<'JS'", "const a = 1;", "JS"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: PY のヒアドキュメントの中は Python で読む(def がキーワード)",
    actual: () => colorOf("a.sh", ["python3 - <<'PY'", "def f(): pass", "PY"], { line: 1, word: "def" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 引用符の無い区切り(JSON)のヒアドキュメントも読む(true がキーワード)",
    actual: () => colorOf("a.sh", ["cat <<JSON", '{"a": true}', "JSON"], { line: 1, word: "true" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 二重引用符の区切り(JS)のヒアドキュメントも読む(const がキーワード)",
    actual: () => colorOf("a.sh", ['node - <<"JS"', "const a = 1;", "JS"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: << と区切りの語の間に空白のあるヒアドキュメント(<< 'JS')も読む(const がキーワード)",
    actual: () => colorOf("a.sh", ["cat << 'JS'", "const a = 1;", "JS"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 行頭のタブを除いて閉じる TS のヒアドキュメントは、タブを除いた区切りの行で閉じる(次の行の echo がキーワード)",
    actual: () => colorOf("a.sh", ["cat <<-'TS'", "\tconst b = 1;", "\tTS", "echo done"], { line: 3, word: "echo" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: - の無い TS のヒアドキュメントは、タブ付きの区切りの行では閉じない(次の行の echo は変数)",
    actual: () => colorOf("a.sh", ["cat <<'TS'", "\tconst b = 1;", "\tTS", "echo done"], { line: 3, word: "echo" }),
    expected: "tok-var",
  },
  {
    label: "色分け: 知らない区切り(CASES)のヒアドキュメントの中身はシェルで読む(echo がキーワード)",
    actual: () => colorOf("a.sh", ["cat <<'CASES'", "echo done", "CASES"], { line: 1, word: "echo" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: ヒアドキュメントの区切りの行そのものは、埋め込みの言語で読まない(JS の行が型の色にならない)",
    actual: () => colorOf("a.sh", ["cat <<'JS'", "const a = 1;", "JS"], { line: 2, word: "JS" }),
    expected: null,
  },
  {
    label: "色分け: ヒアドキュメントの区切りの行の後ろはシェルに戻る(echo がキーワード)",
    actual: () => colorOf("a.sh", ["cat <<'JS'", "const a = 1;", "JS", "echo done"], { line: 3, word: "echo" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: script 要素の開きタグを開いた行として読み始めると JS になる(const がキーワード)",
    actual: () => colorOf("a.html", ["const a = 1;"], { word: "const", openingLine: "<script>" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 開いた行で開いたコメントは持ち越さない(script 要素の開きタグに続く /* の次の行の const がキーワード)",
    actual: () => colorOf("a.html", ["const a = 1;"], { word: "const", openingLine: "<script>/*" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: 埋め込みを開いていない行(div)からは、頭から読むのと同じになる(const は色なし)",
    actual: () => colorOf("a.html", ["const a = 1;"], { word: "const", openingLine: "<div>" }),
    expected: null,
  },
  {
    label: "色分け: 抜粋の openingLine が script 要素の開きタグなら、.html の抜粋の const はキーワードになる",
    actual: () => colorIn(ExcerptRows.create({ path: "a.html", start: 3, end: 3, text: "const a = 1;", openingLine: "<script>" }).map((row) => row.tokens), 0, "const"),
    expected: "tok-kw",
  },
  {
    label: "色分け: 抜粋の openingLine が文字列でなければ、頭から読む(const は色なし)",
    actual: () => colorIn(ExcerptRows.create({ path: "a.html", start: 3, end: 3, text: "const a = 1;", openingLine: ["<script>"] }).map((row) => row.tokens), 0, "const"),
    expected: null,
  },
  {
    label: "色分け: 抜粋の 1 行目で開いた /* は、2 行目に持ち越す(2 行目はコメント)",
    actual: () => ExcerptRows.create({ path: "a.html", start: 3, end: 4, text: "/* a\nconst b", openingLine: "<script>" })[1].tokens.map((token) => token.cls),
    expected: ["tok-com"],
  },
  {
    label: "色分け: 規則の無い拡張子(.md)の抜粋は、開いた行があっても各行が色の無い 1 字句になる",
    actual: () => ExcerptRows.create({ path: "a.md", start: 3, end: 4, text: "const a = 1;\nconst b", openingLine: "<script>" }).map((row) => row.tokens.map((token) => [token.cls, token.value])),
    expected: [[[null, "const a = 1;"]], [[null, "const b"]]],
  },
  {
    label: "色分け: n 番目の hunk には、地図の hunkOpeningLines の n 番目が付く(2 つ目だけ script 要素の開きタグなら、2 つ目の const だけキーワード)",
    actual: () => hunkColorsOf(twoScriptHunks, [{ old: null, new: null }, scriptOpened], "const"),
    expected: [[null], ["tok-kw"]],
  },
  {
    label: "色分け: 地図の hunkOpeningLines が配列でなければ、どの hunk も頭から読む",
    actual: () => hunkColorsOf(twoScriptHunks, { length: 2, 0: scriptOpened, 1: scriptOpened }, "const"),
    expected: [[null], [null]],
  },
  {
    label: "色分け: 地図の hunkOpeningLines の要素の old が文字列で new が数なら、- の行だけ開いた行から読む",
    actual: () => hunkColorsOf(["@@ -1,1 +1,1 @@", "-const a = 1;", "+const a = 2;"], [{ old: "<script>", new: 1 }], "const"),
    expected: [["tok-kw", null]],
  },
  {
    label: "色分け: 地図の hunkOpeningLines の長さが hunk の数と違えば、どの hunk も頭から読む",
    actual: () => hunkColorsOf(twoScriptHunks, [scriptOpened], "const"),
    expected: [[null], [null]],
  },
  {
    label: "色分け: 変更前と変更後で開いた行が違う hunk で、- の行は変更前の開いた行で読む",
    actual: () => hunkColorsOf(["@@ -1,2 +1,2 @@", " x = 1;", "-const a = 1;", "+const a = 2;"], [{ old: "<script>", new: null }], "const"),
    expected: [["tok-kw", null]],
  },
  {
    label: "色分け: 変更前と変更後で開いた行が違う hunk で、+ の行は変更後の開いた行で読む",
    actual: () => hunkColorsOf(["@@ -1,2 +1,2 @@", " x = 1;", "-const a = 1;", "+const a = 2;"], [{ old: null, new: "<script>" }], "const"),
    expected: [[null, "tok-kw"]],
  },
  {
    label: "色分け: 消した行で開いた script 要素は、足した行の色に効かない",
    actual: () => hunkColorsOf(["@@ -1,1 +1,1 @@", "-<script>", "+const a = 1;"], [{ old: null, new: null }], "const"),
    expected: [[null]],
  },
  {
    label: "色分け: 足した行で開いた script 要素は、消した行の色に効かない",
    actual: () => hunkColorsOf(["@@ -1,1 +1,1 @@", "+<script>", "-const a = 1;"], [{ old: null, new: null }], "const"),
    expected: [[null]],
  },
  {
    label: "色分け: 前後の行は、変更前と変更後の両方で読み進める(前後の行で開いた script 要素の後の - と + の const がどちらもキーワード)",
    actual: () => hunkColorsOf(["@@ -1,2 +1,2 @@", " <script>", "-const a = 1;", "+const a = 2;"], [{ old: null, new: null }], "const"),
    expected: [["tok-kw", "tok-kw"]],
  },
  {
    label: "色分け: 変更前と変更後で開いた行が違う hunk では、前後の行を変更後の字句で表示する",
    actual: () => hunkColorsOf(["@@ -1,1 +1,1 @@", " const c = 1;"], [{ old: "<script>", new: null }], "const"),
    expected: [[null]],
  },
  {
    label: "色分け: .tsx の式が始まる位置(行頭・( [ { , = => ? : && || と return の後)の <名前 はタグとしてキーワードになる",
    actual: () => ["<b />", "f(<b />)", "[<b />]", "a = {<b />};", "f(a, <b />)", "a = <b />", "() => <b />", "c ? <b /> : null", "c ? null : <b />", "c && <b />", "c || <b />", "return <b />;"].map((line) => colorOf("a.tsx", [line], { word: "<b" })),
    expected: Array(12).fill("tok-kw"),
  },
  {
    label: "色分け: .tsx の値の後(名前・)・] の後)の < はタグにせず、比較・型引数のまま読む",
    actual: () => ["a<b", "f<T>(x)", "(a)<b", "xs[0]<b", "b as Array<T>"].map((line) => lineTokensOf("a.tsx", [line])[0].filter((token) => token.value.length > 1 && token.value.startsWith("<")).length),
    expected: [0, 0, 0, 0, 0],
  },
  {
    label: "色分け: .tsx の総称の矢印関数の型引数(<T,> / <T extends U> / <const T,>)はタグにせず、T は型になる",
    actual: () => ["const id = <T,>(x: T) => x;", "const id = <T extends U>(x: T) => x;", "const id = <const T,>(x: T) => x;"].map((line) => colorOf("a.tsx", [line], { word: "T" })),
    expected: ["tok-type", "tok-type", "tok-type"],
  },
  {
    label: "色分け: .tsx で名前の後の extends に = が続くなら、型引数ではなく属性として読む(<a extends=\"x\" /> の <a はタグ)",
    actual: () => colorOf("a.tsx", ['return <a extends="x" />;'], { word: "<a" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .ts では JSX を読まない(<T>b の型表明の T は型)",
    actual: () => colorOf("a.ts", ["const a = <T>b;"], { word: "T" }),
    expected: "tok-type",
  },
  {
    label: "色分け: .jsx も JSX を読む(<div はキーワード)",
    actual: () => colorOf("a.jsx", ["return <div />;"], { word: "<div" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: script 要素の中の JS では JSX を読まない(<b>1 の b は変数)",
    actual: () => colorOf("a.html", ["<script>", "const a = <b>1;"], { line: 1, word: "b" }),
    expected: "tok-var",
  },
  {
    label: "色分け: JSX の大文字で始まるタグ名も、型にせずキーワードにする",
    actual: () => colorOf("a.tsx", ["return <SearchGlyph />;"], { word: "<SearchGlyph" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の . を含むタグ名(<Foo.Bar)は 1 つの字句になる",
    actual: () => colorOf("a.tsx", ["return <Foo.Bar />;"], { word: "<Foo.Bar" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の : を含むタグ名(<svg:path)は 1 つの字句になる",
    actual: () => colorOf("a.tsx", ["return <svg:path d='x' />;"], { word: "<svg:path" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の閉じタグ(</h3)もキーワードになる",
    actual: () => colorOf("a.tsx", ["return <h3>a</h3>;"], { word: "</h3" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の属性名はキーになる",
    actual: () => colorOf("a.tsx", ['return <div className="c" />;'], { word: "className" }),
    expected: "tok-key",
  },
  {
    label: "色分け: JSX のハイフンを含む属性名(aria-label / data-testid)は 1 つの字句のキーになる",
    actual: () => ["aria-label", "data-testid"].map((word) => colorOf("a.tsx", ['return <span aria-label="x" data-testid="y" />;'], { word })),
    expected: ["tok-key", "tok-key"],
  },
  {
    label: "色分け: JSX の : を含む属性名(xlink:href)は 1 つの字句のキーになる",
    actual: () => colorOf("a.tsx", ['return <use xlink:href="#a" />;'], { word: "xlink:href" }),
    expected: "tok-key",
  },
  {
    label: "色分け: JSX の値の無い属性(disabled)もキーになる",
    actual: () => colorOf("a.tsx", ["return <button disabled />;"], { word: "disabled" }),
    expected: "tok-key",
  },
  {
    label: "色分け: JSX の属性の値の文字列は文字列になる",
    actual: () => colorOf("a.tsx", ['return <div className="a b" />;'], { word: '"a b"' }),
    expected: "tok-str",
  },
  {
    label: "色分け: JSX の本文の文言は、キーワードや大文字で始まる綴りでも色を付けない",
    actual: () => colorOf("a.tsx", ["return <h3>Used by return</h3>;"], { word: "Used by return" }),
    expected: null,
  },
  {
    label: "色分け: JSX の本文の引用符は文字列を始めない(' の後の閉じタグはキーワード、\"{…}\" の中は変数)",
    actual: () => [colorOf("a.tsx", ["return <p>Don't do</p>;"], { word: "</p" }), colorOf("a.tsx", ['return <p>"{note}"</p>;'], { word: "note" })],
    expected: ["tok-kw", "tok-var"],
  },
  {
    label: "色分け: JSX の本文の中の {…} は JS / TS で読み、閉じた後は本文に戻る({count} は変数、後ろの文言は色なし)",
    actual: () => [colorOf("a.tsx", ["return <p>{count} items</p>;"], { word: "count" }), colorOf("a.tsx", ["return <p>{count} items</p>;"], { word: " items" })],
    expected: ["tok-var", null],
  },
  {
    label: "色分け: JSX の属性の値の {…} は JS / TS で読む(setB は関数)",
    actual: () => colorOf("a.tsx", ["return <a onClick={() => setB(b)} />;"], { word: "setB" }),
    expected: "tok-fn",
  },
  {
    label: "色分け: JSX の属性の値の {…} を閉じた後は、属性に戻る(後ろの title はキー)",
    actual: () => colorOf("a.tsx", ['return <a onClick={f} title="x" />;'], { word: "title" }),
    expected: "tok-key",
  },
  {
    label: "色分け: JSX の属性の値の {{ … }} の中のオブジェクトのキーは色を付けない",
    actual: () => colorOf("a.tsx", ["return <a style={{ color: c }} />;"], { word: "color" }),
    expected: null,
  },
  {
    label: "色分け: JSX の開きタグの中の // はコメントになり、次の行の属性はキーのまま",
    actual: () => { const lines = lineTokensOf("a.tsx", ["return <button", "  // note", '  type="button"', "/>;"]); return [colorIn(lines, 1, "// note"), colorIn(lines, 2, "type")]; },
    expected: ["tok-com", "tok-key"],
  },
  {
    label: "色分け: JSX の開きタグが行をまたぐと、次の行の属性名もキーになる(キーワードの綴りの type でも)",
    actual: () => colorOf("a.tsx", ["return (", "  <button", '    type="button"', "  >"], { line: 2, word: "type" }),
    expected: "tok-key",
  },
  {
    label: "色分け: JSX の子の中の文言だけの行は、行をまたいでも色を付けない",
    actual: () => lineTokensOf("a.tsx", ["return <h3>", "  Used by", "</h3>;"])[1].map((token) => token.cls),
    expected: [null],
  },
  {
    label: "色分け: JSX の自己閉じタグの後は JS / TS に戻る(次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["const a = <b />;", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の閉じタグの後は JS / TS に戻る(次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["const a = <b>x</b>;", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の入れ子の要素を閉じても、外側の要素の子のまま(次の行の文言は色なし)",
    actual: () => lineTokensOf("a.tsx", ["return <div>", "<b>x</b>", "Used by", "</div>;"])[2].map((token) => token.cls),
    expected: [null],
  },
  {
    label: "色分け: JSX のフラグメントの <> と </> はキーワードになり、中の文言は色なし",
    actual: () => { const [line] = lineTokensOf("a.tsx", ["return <>Used by</>;"]); return ["<>", "</>", "Used by"].map((word) => colorIn([line], 0, word)); },
    expected: ["tok-kw", "tok-kw", null],
  },
  {
    label: "色分け: JSX のフラグメントの </> の後は JS / TS に戻る(次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["const a = <>x</>;", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の子の中の {…} に入れた要素を閉じ、{…} を閉じても、外側の要素を閉じた後は JS / TS に戻る",
    actual: () => colorOf("a.tsx", ["return <ul>", "  {items.map((item) => <li key={item.id}>{item.name}</li>)}", "</ul>;", "const c = 1;"], { line: 3, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の要素の途中から読み始めて来た閉じタグはキーワードで、その後は JS / TS のまま(次の行の const はキーワード)",
    actual: () => { const lines = lineTokensOf("a.tsx", ["  </div>", ");", "const c = 1;"]); return [colorIn(lines, 0, "</div"), colorIn(lines, 2, "const")]; },
    expected: ["tok-kw", "tok-kw"],
  },
  {
    label: "色分け: .tsx の総称の矢印関数の型引数は、名前に = が続く形(<T = U,>)でもタグにせず、T は型になる",
    actual: () => colorOf("a.tsx", ["const id = <T = U,>(x: T) => x;"], { word: "T" }),
    expected: "tok-type",
  },
  {
    label: "色分け: .tsx で名前の後の extends に > か / が続くなら、型引数ではなく属性として読む(<a extends /> と <a extends>x</a> の <a はタグ)",
    actual: () => ["return <a extends />;", "return <a extends>x</a>;"].map((line) => colorOf("a.tsx", [line], { word: "<a" })),
    expected: ["tok-kw", "tok-kw"],
  },
  {
    label: "色分け: JSX の子の中の自己閉じタグの後は、外側の要素の子に戻る(次の行の文言は色なし)",
    actual: () => lineTokensOf("a.tsx", ["return <div>", "<br />", "Used by", "</div>;"])[2].map((token) => token.cls),
    expected: [null],
  },
  {
    label: "色分け: JSX の / と > の間に空白のある自己閉じタグ(<br / >)の後も、JS / TS に戻る(次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["const a = <br / >;", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の子の本文が ( 1 文字だけでも括弧として積まない(閉じタグの後の ) は外側の f( を閉じ、次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["f(<p>(</p>);", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: JSX の子の {…} の後の本文が [ 1 文字だけでも括弧として積まない(閉じタグの後の ] は外側の [ を閉じ、次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["f([<p>{a}[</p>]);", "const c = 1;"], { line: 1, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .tsx で名前の後が => なら、型引数ではなくタグとして読む(<T=> の <T はキーワード)",
    actual: () => colorOf("a.tsx", ["const f = <T=>(x: T) => x;"], { word: "<T" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: .tsx で extends の後が == か /= なら、属性ではなく型引数として読む(<T extends == / <T extends /= の T は型)",
    actual: () => ["const f = <T extends ==(x: T) => x;", "const f = <T extends /=(x: T) => x;"].map((line) => colorOf("a.tsx", [line], { word: "T" })),
    expected: ["tok-type", "tok-type"],
  },
  {
    label: "色分け: .tsx の文字列の続きの行がタグの綴り(<div)だけでも、タグとして段を積まない(文字列を閉じた次の行の const はキーワード)",
    actual: () => colorOf("a.tsx", ["const s = `", "<div", "`;", "const c = 1;"], { line: 3, word: "const" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: HTML の値の無い属性(disabled)も、値のある属性(type)と同じくキーになり、属性の値は文字列になる",
    actual: () => ["disabled", "type", '"text"'].map((word) => colorOf("a.html", ['<input disabled type="text">'], { word })),
    expected: ["tok-key", "tok-key", "tok-str"],
  },
  {
    label: "色分け: HTML のハイフンを含む属性名(aria-label)は 1 つの字句のキーになる",
    actual: () => colorOf("a.html", ['<div aria-label="x">'], { word: "aria-label" }),
    expected: "tok-key",
  },
  {
    label: "色分け: HTML のタグの外の本文の語は、= が続いてもキーにしない(<p>Done a=b</p> の Done と a は色なし)",
    actual: () => ["Done", "a"].map((word) => colorOf("a.html", ["<p>Done a=b</p>"], { word })),
    expected: [null, null],
  },
  {
    label: "色分け: HTML の本文の ' は文字列を始めない(後ろの閉じタグ </p はキーワード)",
    actual: () => colorOf("a.html", ["<p>Don't</p>"], { word: "</p" }),
    expected: "tok-kw",
  },
  {
    label: "色分け: HTML の開きタグが行をまたぐと、次の行の値の無い属性もキーになり、> の後の本文は色なしに戻る",
    actual: () => { const lines = lineTokensOf("a.html", ["<input", "  disabled", ">", "Done"]); return [colorIn(lines, 1, "disabled"), colorIn(lines, 3, "Done")]; },
    expected: ["tok-key", null],
  },
  {
    label: "色分け: HTML の引用符の無い属性の値はキーにしない(charset=utf-8 の utf-8 は色なし)",
    actual: () => colorOf("a.html", ["<meta charset=utf-8>"], { word: "utf-8" }),
    expected: null,
  },
  {
    label: "色分け: HTML のコメントの続きの行がタグの綴り(<p)だけでも、開きタグの中に入らない(コメントを閉じた次の行の本文は色なし)",
    actual: () => colorOf("a.html", ["<!--", "<p", "-->", "Done"], { line: 3, word: "Done" }),
    expected: null,
  },
  {
    label: "色分け: HTML の本文のコメントは 1 つの字句のコメントになる",
    actual: () => colorOf("a.html", ["<!-- note -->"], { word: "<!-- note -->" }),
    expected: "tok-com",
  },
  {
    label: "色分け: HTML のコメントの中の script 要素の開きタグでは JS に切り替わらない(次の行の const は色なし)",
    actual: () => colorOf("a.html", ["<!-- <script> -->", "const a = 1;"], { line: 1, word: "const" }),
    expected: null,
  },
  {
    label: "色分け: YAML の値の大文字の語は型にならない",
    actual: () => colorOf("a.yml", ["name: PR Explain"], { word: "PR" }),
    expected: null,
  },
  {
    label: "色分け: シェルの $(dirname \"$0\") の $ は関数にならない",
    actual: () => colorOf("a.sh", ['dir=$(dirname "$0")'], { word: "$" }),
    expected: null,
  },
  {
    label: "色分け: シェルでは . の後の語をメンバーにしない(if .merged then . else の else はキーワードのまま)",
    actual: () => colorOf("a.sh", ["if .merged then . else"], { word: "else" }),
    expected: "tok-kw",
  },
  ...Object.keys(checkerVocabulary).map((name) => ({
    label: `語彙 ${name} のキーの集合は、解説の検査とページの表で同じ`,
    actual: () => Object.keys(Vocabulary[name]).toSorted(),
    expected: [...checkerVocabulary[name]].sort(),
  })),
  {
    label: "解説の検査が受け付ける Target の kind はどれも、ページが検査の求めるキーを読んで移る先にする",
    actual: () => Object.entries(checkerTargetKeys).map(([kind, keys]) => {
      const selection = Target.selectionOf({ kind, ...Object.fromEntries(keys.map((key) => [key, `値-${key}`])) });
      return [kind, selection !== undefined && keys.some((key) => selection.id.endsWith(`値-${key}`))];
    }),
    expected: Object.keys(checkerTargetKeys).map((kind) => [kind, true]),
  },
  {
    label: "色分けの埋め込みの要素の名前の集合は、解説の検査とページで同じ",
    actual: () => Object.keys(Tokenizer.Embeddings.elements).toSorted(),
    expected: [...checkerElements].sort(),
  },
  {
    label: "色分けの埋め込みのヒアドキュメントの区切りの語の集合は、解説の検査とページで同じ",
    actual: () => Object.keys(Tokenizer.Embeddings.heredocs).toSorted(),
    expected: [...checkerHeredocs].sort(),
  },
  {
    label: "要素を読む拡張子の集合とヒアドキュメントを読む拡張子の集合は、どちらも解説の検査とページで同じ",
    actual: () => {
      const extensionsWhere = (reads) => Tokenizer.Extensions.filter((extension) => reads(Tokenizer.grammarOf(`a.${extension}`))).map((extension) => `.${extension}`).toSorted();
      return { elements: extensionsWhere((grammar) => grammar.tags === true), heredocs: extensionsWhere((grammar) => grammar.heredocs === true) };
    },
    expected: { elements: [...checkerExtensions.elements].sort(), heredocs: [...checkerExtensions.heredocs].sort() },
  },
  {
    label: "テンプレートのすべての行で、解説の検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと同じ",
    actual: () => regionMismatchesOf(process.argv[2]),
    expected: [],
  },
  {
    label: "この判定表のすべての行で、解説の検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと同じ",
    actual: () => regionMismatchesOf(checkedPathOf("pr-explain-core-cases.sh")),
    expected: [],
  },
  {
    label: "解説とテンプレートの検査の判定表のすべての行で、解説の検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと同じ",
    actual: () => ["build-pr-explain-cases.sh", "check-pr-explain-template-cases.sh"].map((name) => regionMismatchesOf(checkedPathOf(name))),
    expected: [[], []],
  },
  {
    label: "見本のヒアドキュメント(引用符なし・二重引用符・行頭のタブを除いて閉じるもの・TS・JSON・PY・知らない区切り・<< と区切りの語の間に空白のあるもの)で、解説の検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと同じ",
    actual: () => regionMismatchesOf(checkedPathOf("heredocs.sh")),
    expected: [],
  },
  {
    label: "見本の要素(大文字のタグ・属性付きの開きタグ・同じ行で閉じる要素・中の文字列にある別の要素の開きタグと閉じタグ)で、解説の検査の開いた行から作った埋め込みが、1 行目から読み進めた埋め込みと同じ",
    actual: () => regionMismatchesOf(checkedPathOf("elements.html")),
    expected: [],
  },
  {
    label: "判定表 3 本は、どれも最後の行を読み終えた後に埋め込みが閉じている",
    actual: () => casesTables.map((path) => regionsAlong(path).last),
    expected: [null, null, null],
  },
  {
    label: "判定表 3 本で、解説の検査が開いた行として返す行は、どれも行の終わりが区切りの語の付いた << で終わる",
    actual: () => casesTables.map((path) => [...new Set(checkerOpenings[path].filter((opening) => opening !== null))].filter((opening) => !EndsWithHeredocStart.test(opening))),
    expected: [[], [], []],
  },
];

// 1 件が例外で止まっても、残りのケースは走らせて、そのケースだけを食い違いとして出す。
const decisionOf = (actual, expected) => {
  try {
    const got = JSON.stringify(plain(actual()));
    return got === JSON.stringify(expected) ? "same" : `got:${got}`;
  } catch (error) {
    return `threw:${error.message}`;
  }
};
for (const { label, actual, expected } of cases) console.log(`${decisionOf(actual, expected)}\t${label}`);
JS
)"
status=$?

if [ "$status" -ne 0 ]; then
  printf 'NG   核を評価できない(node の終了コード %s)\n' "$status"
  [ -n "$results" ] && printf '%s\n' "$results"
  exit 1
fi

while IFS=$'\t' read -r decision label; do
  [ -n "$label" ] || continue
  report same "$decision" "$label"
done <<< "$results"

exit "$cases_failed"
