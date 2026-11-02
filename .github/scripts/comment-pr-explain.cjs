/* 公開済みのサイトをデータとして読み、現在の PR と同じ版だけ案内する。 */
module.exports = async ({ github, context }) => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const marker = '<!-- pdfmod-pr-explain -->';
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const published = path.resolve('site/pr-explain');
  let entries;
  try {
    entries = await fs.readdir(published, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const pageUrl = new URL(process.env.PR_EXPLAIN_PAGE_URL);
  if (!pageUrl.pathname.endsWith('/')) {
    pageUrl.pathname += '/';
  }
  const runUrl = `${context.serverUrl}/${repository}/actions/runs/${context.runId}`;

  async function readPublishedMap(folder) {
    try {
      const index = await fs.lstat(path.join(folder, 'index.html'));
      const mapFile = await fs.lstat(path.join(folder, 'change-map.json'));
      if (!index.isFile() || !mapFile.isFile()) {
        return null;
      }
      return JSON.parse(await fs.readFile(path.join(folder, 'change-map.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  }

  async function commentPublishedPr(entry) {
    const match = /^pr-([1-9][0-9]*)$/.exec(entry.name);
    if (!entry.isDirectory() || match?.[0] !== entry.name) {
      return;
    }
    const number = Number(match[1]);
    if (!Number.isSafeInteger(number)) {
      return;
    }

    const map = await readPublishedMap(path.join(published, entry.name));
    if (map?.version !== 2 || map.pr !== number) {
      return;
    }
    const validHead = typeof map.head === 'string' && map.head.length === 40 && /^[a-f0-9]{40}$/.test(map.head);
    if (!validHead) {
      return;
    }

    let pr;
    try {
      ({ data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number }));
    } catch (error) {
      if (error.status === 404) {
        return;
      }
      throw error;
    }
    if (pr.state !== 'open' || pr.head?.repo?.full_name !== repository) {
      return;
    }
    if (pr.user?.login === 'dependabot[bot]' || pr.head.sha !== map.head) {
      return;
    }

    const url = new URL(`pr-explain/${entry.name}/`, pageUrl).href;
    const body = `${marker}\n[📖 PR の解説](${url}) · \`${map.head}\` · [公開 CI](${runUrl})`;
    const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: number, per_page: 100 });
    const previous = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker));
    if (!previous) {
      await github.rest.issues.createComment({ ...context.repo, issue_number: number, body });
      return;
    }
    if (previous.body !== body) {
      await github.rest.issues.updateComment({ ...context.repo, comment_id: previous.id, body });
    }
  }

  for (const entry of entries) {
    await commentPublishedPr(entry);
  }
};
