import { env } from './config';

type GitHubErrorPayload = {
  message?: string;
  documentation_url?: string;
};

export class GitHubApiError extends Error {
  status: number;
  details: string | null;

  constructor(status: number, message: string, details: string | null = null) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.details = details;
  }
}

async function githubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let payload: GitHubErrorPayload | null = null;
    let rawBody: string | null = null;

    try {
      payload = (await response.json()) as GitHubErrorPayload;
    } catch {
      try {
        rawBody = await response.text();
      } catch {
        rawBody = null;
      }
    }

    const message =
      payload?.message ??
      rawBody ??
      `GitHub API request failed with ${response.status}`;
    const details = payload?.documentation_url ?? null;

    throw new GitHubApiError(response.status, message, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

export type GitHubCommitResponse = {
  sha: string;
  tree: {
    sha: string;
  };
};

export type GitHubTreeEntry = {
  path?: string;
  mode?: string;
  type?: 'blob' | 'tree' | 'commit';
  sha?: string;
};

export type GitHubTreeResponse = {
  sha: string;
  tree: GitHubTreeEntry[];
};

export type GitHubBlobResponse = {
  content: string;
  encoding: 'base64' | string;
};

export type CreateTreeEntry = {
  path: string;
  mode: '100644';
  type: 'blob';
  content: string;
};

export type CreateTreeResponse = {
  sha: string;
};

export type CreateCommitResponse = {
  sha: string;
};

export function getRef(owner: string, repo: string, branch: string) {
  return githubRequest<GitHubRefResponse>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );
}

export function getCommit(owner: string, repo: string, sha: string) {
  return githubRequest<GitHubCommitResponse>(`/repos/${owner}/${repo}/git/commits/${sha}`);
}

export function getTree(owner: string, repo: string, treeSha: string) {
  return githubRequest<GitHubTreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`
  );
}

export function getBlob(owner: string, repo: string, sha: string) {
  return githubRequest<GitHubBlobResponse>(`/repos/${owner}/${repo}/git/blobs/${sha}`);
}

export function createTree(
  owner: string,
  repo: string,
  baseTreeSha: string,
  tree: CreateTreeEntry[]
) {
  return githubRequest<CreateTreeResponse>(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree,
    }),
  });
}

export function createCommit(
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  parentSha: string
) {
  return githubRequest<CreateCommitResponse>(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  });
}

export function updateRef(owner: string, repo: string, branch: string, sha: string) {
  return githubRequest<undefined>(
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sha }),
    }
  );
}
