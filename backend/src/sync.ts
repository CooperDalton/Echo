import type { CheckIn, Note, NotesState } from './contracts';
import {
  createCommit,
  createTree,
  getBlob,
  getCommit,
  getRef,
  getTree,
  type GitHubTreeEntry,
  updateRef,
} from './github';
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
  tree: GitHubTreeEntry[]
): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();

  for (const entry of tree) {
    if (entry.type !== 'blob' || !entry.sha || !isVaultMarkdownPath(entry.path)) continue;

    const blob = await getBlob(repo.owner, repo.repo, entry.sha);
    fileMap.set(entry.path, decodeBase64(blob.content));
  }

  return fileMap;
}

export async function loadRepoSnapshot(repo: RepoRef): Promise<RepoSnapshot> {
  const ref = await getRef(repo.owner, repo.repo, repo.branch);
  const commit = await getCommit(repo.owner, repo.repo, ref.object.sha);
  const treeResponse = await getTree(repo.owner, repo.repo, commit.tree.sha);

  const existingFiles = await fetchMarkdownFiles(repo, treeResponse.tree);
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
    baseTreeSha: commit.tree.sha,
    headCommitSha: commit.sha,
    existingFiles,
  };
}

async function commitFiles(
  repo: RepoRef,
  snapshot: RepoSnapshot,
  desiredFiles: Map<string, string>,
  deviceId: string
): Promise<number> {
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

  const newTree = await createTree(repo.owner, repo.repo, snapshot.baseTreeSha, changedEntries);
  const commit = await createCommit(
    repo.owner,
    repo.repo,
    `Sync Echo vault from ${deviceId}`,
    newTree.sha,
    snapshot.headCommitSha
  );
  await updateRef(repo.owner, repo.repo, repo.branch, commit.sha);

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
