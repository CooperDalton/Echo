import type { BucketPreferences, CheckIn, DeletedNote, Note, NotesState, StandingMessage } from './contracts';
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
  BUCKET_PREFERENCES_PATH,
  DELETED_NOTES_PATH,
  STANDING_MESSAGES_PATH,
  notePath,
  checkInPath,
  parseBucketPreferences,
  parseDeletedNotes,
  parseStandingMessages,
  parseCheckInFile,
  parseNoteFile,
  serializeBucketPreferences,
  serializeDeletedNotes,
  serializeStandingMessages,
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
  deletedNotes: DeletedNote[];
  bucketPreferences: BucketPreferences;
  standingMessages: StandingMessage[];
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

function mergeDeletedNotes(local: DeletedNote[], remote: DeletedNote[]): DeletedNote[] {
  const map = new Map<string, DeletedNote>();

  remote.forEach((deletedNote) => {
    map.set(deletedNote.id, deletedNote);
  });

  local.forEach((deletedNote) => {
    const existing = map.get(deletedNote.id);
    if (!existing || compareIsoDates(deletedNote.deletedAt, existing.deletedAt) > 0) {
      map.set(deletedNote.id, deletedNote);
    }
  });

  return [...map.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function mergeBucketPreferences(
  local: BucketPreferences,
  remote: BucketPreferences
): BucketPreferences {
  return {
    builtins: {
      ...remote.builtins,
      ...local.builtins,
    },
    customs: local.customs.length > 0 ? local.customs : remote.customs,
  };
}

function decodeBase64(content: string): string {
  return Buffer.from(content, 'base64').toString('utf8');
}

function isVaultManagedPath(path: string | undefined): path is string {
  return Boolean(
    path &&
      ((path.endsWith('.md') &&
        (path.startsWith('Echo/Notes/') || path.startsWith('Echo/Checkins/'))) ||
        path === DELETED_NOTES_PATH ||
        path === BUCKET_PREFERENCES_PATH ||
        path === STANDING_MESSAGES_PATH)
  );
}

async function fetchMarkdownFiles(
  repo: RepoRef,
  tree: GitHubTreeEntry[]
): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();

  for (const entry of tree) {
    if (entry.type !== 'blob' || !entry.sha || !isVaultManagedPath(entry.path)) continue;

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
  const deletedNotes = parseDeletedNotes(existingFiles.get(DELETED_NOTES_PATH) ?? '[]');
  const bucketPreferences = parseBucketPreferences(
    existingFiles.get(BUCKET_PREFERENCES_PATH) ?? '{}'
  );
  const standingMessages = parseStandingMessages(
    existingFiles.get(STANDING_MESSAGES_PATH) ?? '[]'
  );

  existingFiles.forEach((markdown, path) => {
    if (path === DELETED_NOTES_PATH || path === BUCKET_PREFERENCES_PATH || path === STANDING_MESSAGES_PATH) return;
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
    deletedNotes,
    bucketPreferences,
    standingMessages,
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

  const deletedEntries = [...snapshot.existingFiles.keys()]
    .filter((path) => isVaultManagedPath(path) && !desiredFiles.has(path))
    .map((path) => ({
      path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null,
    }));

  const treeEntries = [...changedEntries, ...deletedEntries];

  if (treeEntries.length === 0) {
    return 0;
  }

  const newTree = await createTree(repo.owner, repo.repo, snapshot.baseTreeSha, treeEntries);
  const commit = await createCommit(
    repo.owner,
    repo.repo,
    `Sync Echo vault from ${deviceId}`,
    newTree.sha,
    snapshot.headCommitSha
  );
  await updateRef(repo.owner, repo.repo, repo.branch, commit.sha);

  return treeEntries.length;
}

export async function syncRepoSnapshot(
  repo: RepoRef,
  state: NotesState,
  deviceId: string
): Promise<SyncOutput> {
  const remote = await loadRepoSnapshot(repo);
  const mergedDeletedNotes = mergeDeletedNotes(state.deletedNotes, remote.deletedNotes);
  const mergedBucketPreferences = mergeBucketPreferences(
    state.bucketPreferences,
    remote.bucketPreferences
  );
  const deletedIds = new Set(mergedDeletedNotes.map((deletedNote) => deletedNote.id));
  const mergedNotes = mergeNotes([...state.recent, ...state.reviewed], remote.notes).filter(
    (note) => !deletedIds.has(note.id)
  );
  const mergedCheckIns = mergeCheckIns(state.checkIns, remote.checkIns);
  const mergedStandingMessages =
    state.standingMessages.length > 0 ? state.standingMessages : remote.standingMessages;

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
  desiredFiles.set(DELETED_NOTES_PATH, serializeDeletedNotes(mergedDeletedNotes));
  desiredFiles.set(
    BUCKET_PREFERENCES_PATH,
    serializeBucketPreferences(mergedBucketPreferences)
  );
  desiredFiles.set(STANDING_MESSAGES_PATH, serializeStandingMessages(mergedStandingMessages));

  const committedFiles = await commitFiles(repo, remote, desiredFiles, deviceId);

  return {
    state: {
      recent: mergedNotes.filter((note) => note.echo.state !== 'reviewed'),
      reviewed: mergedNotes.filter((note) => note.echo.state === 'reviewed'),
      checkIns: mergedCheckIns,
      deletedNotes: mergedDeletedNotes,
      bucketPreferences: mergedBucketPreferences,
      standingMessages: mergedStandingMessages,
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
