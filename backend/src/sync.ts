import type { RestEndpointMethodTypes } from '@octokit/rest';

import type { CheckIn, Note, NotesState } from './contracts';
import { createGitHubClient } from './github';
import {
  notePath,
  checkInPath,
  parseCheckInFile,
  parseNoteFile,
  serializeCheckIn,
  serializeNote,
  systemFiles,
} from './markdown';

type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

type RepoSnapshot = {
  notes: Note[];
  checkIns: CheckIn[];
  baseTreeSha: string;
  headCommitSha: string;
  existingFiles: Map<string, string>;
};

type SyncSummary = {
  pushedNotes: number;
  pushedCheckIns: number;
  pulledNotes: number;
  pulledCheckIns: number;
  committedFiles: number;
};

type SyncOutput = {
  state: NotesState;
  summary: SyncSummary;
};

type GitTree = RestEndpointMethodTypes['git']['getTree']['response']['data']['tree'];

function compareIsoDates(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return -1;
  if (Number.isNaN(rightTime)) return 1;
  return leftTime - rightTime;
}

function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>();

  remote.forEach((note) => {
    map.set(note.id, note);
  });

  local.forEach((note) => {
    const existing = map.get(note.id);
    if (!existing) {
      map.set(note.id, note);
      return;
    }

    if (compareIsoDates(note.updatedAt, existing.updatedAt) > 0) {
      map.set(note.id, {
        ...note,
        filePath: note.filePath ?? existing.filePath,
      });
    }
  });

  return sortNewestFirst([...map.values()]);
}

function mergeCheckIns(local: CheckIn[], remote: CheckIn[]): CheckIn[] {
  const map = new Map<string, CheckIn>();

  remote.forEach((checkIn) => {
    map.set(checkIn.id, checkIn);
  });

  local.forEach((checkIn) => {
    if (!map.has(checkIn.id)) {
      map.set(checkIn.id, checkIn);
    }
  });

  return sortNewestFirst([...map.values()]);
}

function decodeBase64(content: string): string {
  return Buffer.from(content, 'base64').toString('utf8');
}

function isVaultMarkdownPath(path: string | undefined): path is string {
  return Boolean(
    path &&
      path.endsWith('.md') &&
      (path.startsWith('Echo/Notes/') || path.startsWith('Echo/Checkins/'))
  );
}

async function fetchMarkdownFiles(
  repo: RepoRef,
  tree: GitTree
): Promise<Map<string, string>> {
  const octokit = createGitHubClient();
  const fileMap = new Map<string, string>();

  for (const entry of tree) {
    if (entry.type !== 'blob' || !entry.sha || !isVaultMarkdownPath(entry.path)) continue;

    const blob = await octokit.git.getBlob({
      owner: repo.owner,
      repo: repo.repo,
      file_sha: entry.sha,
    });

    fileMap.set(entry.path, decodeBase64(blob.data.content));
  }

  return fileMap;
}

export async function loadRepoSnapshot(repo: RepoRef): Promise<RepoSnapshot> {
  const octokit = createGitHubClient();
  const ref = await octokit.git.getRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `heads/${repo.branch}`,
  });

  const commit = await octokit.git.getCommit({
    owner: repo.owner,
    repo: repo.repo,
    commit_sha: ref.data.object.sha,
  });

  const treeResponse = await octokit.git.getTree({
    owner: repo.owner,
    repo: repo.repo,
    tree_sha: commit.data.tree.sha,
    recursive: 'true',
  });

  const existingFiles = await fetchMarkdownFiles(repo, treeResponse.data.tree);
  const notes: Note[] = [];
  const checkIns: CheckIn[] = [];

  existingFiles.forEach((markdown, path) => {
    if (path.startsWith('Echo/Notes/')) {
      const parsed = parseNoteFile(markdown, path);
      if (parsed) notes.push(parsed);
      return;
    }

    if (path.startsWith('Echo/Checkins/')) {
      const parsed = parseCheckInFile(markdown, path);
      if (parsed) checkIns.push(parsed);
    }
  });

  return {
    notes: sortNewestFirst(notes),
    checkIns: sortNewestFirst(checkIns),
    baseTreeSha: commit.data.tree.sha,
    headCommitSha: commit.data.sha,
    existingFiles,
  };
}

async function commitFiles(
  repo: RepoRef,
  snapshot: RepoSnapshot,
  desiredFiles: Map<string, string>,
  deviceId: string
): Promise<number> {
  const octokit = createGitHubClient();
  const changedEntries = [...desiredFiles.entries()]
    .filter(([path, content]) => snapshot.existingFiles.get(path) !== content)
    .map(([path, content]) => ({
      path,
      mode: '100644' as const,
      type: 'blob' as const,
      content,
    }));

  if (changedEntries.length === 0) {
    return 0;
  }

  const newTree = await octokit.git.createTree({
    owner: repo.owner,
    repo: repo.repo,
    base_tree: snapshot.baseTreeSha,
    tree: changedEntries,
  });

  const commit = await octokit.git.createCommit({
    owner: repo.owner,
    repo: repo.repo,
    message: `Sync Echo vault from ${deviceId}`,
    tree: newTree.data.sha,
    parents: [snapshot.headCommitSha],
  });

  await octokit.git.updateRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `heads/${repo.branch}`,
    sha: commit.data.sha,
  });

  return changedEntries.length;
}

export async function syncRepoSnapshot(
  repo: RepoRef,
  state: NotesState,
  deviceId: string
): Promise<SyncOutput> {
  const remote = await loadRepoSnapshot(repo);
  const mergedNotes = mergeNotes([...state.recent, ...state.reviewed], remote.notes);
  const mergedCheckIns = mergeCheckIns(state.checkIns, remote.checkIns);

  const desiredFiles = new Map<string, string>();
  mergedNotes.forEach((note) => {
    desiredFiles.set(note.filePath ?? notePath(note), serializeNote(note));
  });
  mergedCheckIns.forEach((checkIn) => {
    desiredFiles.set(checkIn.filePath ?? checkInPath(checkIn), serializeCheckIn(checkIn));
  });
  Object.entries(systemFiles()).forEach(([path, content]) => {
    desiredFiles.set(path, content);
  });

  const committedFiles = await commitFiles(repo, remote, desiredFiles, deviceId);

  return {
    state: {
      recent: mergedNotes.filter((note) => note.echo.state !== 'reviewed'),
      reviewed: mergedNotes.filter((note) => note.echo.state === 'reviewed'),
      checkIns: mergedCheckIns,
    },
    summary: {
      pushedNotes: state.recent.length + state.reviewed.length,
      pushedCheckIns: state.checkIns.length,
      pulledNotes: remote.notes.length,
      pulledCheckIns: remote.checkIns.length,
      committedFiles,
    },
  };
}
