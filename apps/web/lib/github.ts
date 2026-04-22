/**
 * GitHub API client cho tool draft_update + commit_update.
 *
 * - `draft_update` → tạo branch + commit + PR draft. Bất cứ role nào.
 * - `commit_update` → commit thẳng vào default branch. Chỉ admin.
 *
 * Env: GITHUB_TOKEN (fine-grained PAT, write contents + PRs ở repo knowledge).
 */

const API = "https://api.github.com";

function auth() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GithubError("GITHUB_TOKEN chưa set");
  return token;
}

function repoCoords() {
  const owner = process.env.KNOWLEDGE_REPO_OWNER ?? "huytdvn";
  const repo = process.env.KNOWLEDGE_REPO_NAME ?? "locallife-asia";
  const branch = process.env.KNOWLEDGE_REPO_BRANCH ?? "main";
  return { owner, repo, branch };
}

interface GhInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

async function gh<T>(path: string, init: GhInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${auth()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    throw new GithubError(
      `GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`
    );
  }
  return (await res.json()) as T;
}

export class GithubError extends Error {}

async function getBranchSha(branch: string): Promise<string> {
  const { owner, repo } = repoCoords();
  const data = await gh<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`
  );
  return data.object.sha;
}

async function createBranch(newBranch: string, fromSha: string): Promise<void> {
  const { owner, repo } = repoCoords();
  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${newBranch}`, sha: fromSha },
  });
}

async function getFileSha(path: string, branch: string): Promise<string | null> {
  const { owner, repo } = repoCoords();
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${auth()}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(`GET contents: ${res.status}`);
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function putFile(args: {
  path: string;
  branch: string;
  content: string;
  message: string;
}): Promise<{ commitSha: string; htmlUrl: string }> {
  const { owner, repo } = repoCoords();
  const existing = await getFileSha(args.path, args.branch);
  const encoded = Buffer.from(args.content, "utf-8").toString("base64");
  const body: Record<string, unknown> = {
    message: args.message,
    content: encoded,
    branch: args.branch,
  };
  if (existing) body.sha = existing;
  const data = await gh<{
    commit: { sha: string };
    content: { html_url: string };
  }>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(args.path)}`, {
    method: "PUT",
    body,
  });
  return { commitSha: data.commit.sha, htmlUrl: data.content.html_url };
}

async function createPR(args: {
  head: string;
  title: string;
  body: string;
  draft?: boolean;
}): Promise<{ htmlUrl: string; number: number }> {
  const { owner, repo, branch } = repoCoords();
  const data = await gh<{ html_url: string; number: number }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: {
        title: args.title,
        body: args.body,
        head: args.head,
        base: branch,
        draft: args.draft ?? true,
      },
    }
  );
  return { htmlUrl: data.html_url, number: data.number };
}

export interface DraftUpdateInput {
  id: string; // doc ULID
  rationale: string;
  newContent: string; // markdown đầy đủ (FM + body)
  repoPath: string;   // vd: `knowledge/10-hr/policies/leave-policy.md`
  actorEmail: string;
}

export async function draftUpdate(input: DraftUpdateInput): Promise<{
  prUrl: string;
  prNumber: number;
  branch: string;
}> {
  const baseSha = await getBranchSha(repoCoords().branch);
  const branch = `draft-${input.id}-${Date.now()}`;
  await createBranch(branch, baseSha);
  await putFile({
    path: input.repoPath,
    branch,
    content: input.newContent,
    message: `[draft] Update ${input.id} by ${input.actorEmail}`,
  });
  const pr = await createPR({
    head: branch,
    title: `[draft] Update ${input.id}`,
    body: `**Đề xuất bởi**: ${input.actorEmail}\n\n**Lý do**:\n${input.rationale}`,
    draft: true,
  });
  return { prUrl: pr.htmlUrl, prNumber: pr.number, branch };
}

export interface CommitUpdateInput {
  id: string;
  rationale: string;
  newContent: string;
  repoPath: string;
  actorEmail: string;
}

export async function commitUpdateDirect(input: CommitUpdateInput): Promise<{
  commitSha: string;
  htmlUrl: string;
}> {
  const { branch } = repoCoords();
  return putFile({
    path: input.repoPath,
    branch,
    content: input.newContent,
    message: `${input.rationale} (by ${input.actorEmail})`,
  });
}
