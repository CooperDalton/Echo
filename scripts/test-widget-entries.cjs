const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function resolveTsModule(request, parentDir = root) {
  if (request.startsWith('@/')) {
    return resolveExisting(path.join(root, request.slice(2)));
  }

  if (request.startsWith('.')) {
    return resolveExisting(path.resolve(parentDir, request));
  }

  return null;
}

function resolveExisting(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to resolve module: ${basePath}`);
  }

  return found;
}

function loadTs(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);

  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  });

  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const dirname = path.dirname(absolutePath);
  const localRequire = (request) => {
    const resolved = resolveTsModule(request, dirname);
    return resolved ? loadTs(resolved) : require(request);
  };

  const wrapper = `(function (exports, require, module, __filename, __dirname) { ${outputText}\n})`;
  vm.runInThisContext(wrapper, { filename: absolutePath })(
    module.exports,
    localRequire,
    module,
    absolutePath,
    dirname
  );

  return module.exports;
}

const {
  PAUSED_WIDGET_TEXT,
  WIDGET_TEXT_LIMIT,
  compactWidgetText,
  createEchoWidgetTimelineProps,
  createWidgetEntries,
} = loadTs('lib/widgets/entries.ts');

const { DEFAULT_WIDGET_PREFERENCES } = loadTs('lib/notes/types.ts');
const { reviewEchoSchedule } = loadTs('lib/widgets/schedule.ts');
const { extractBearerToken, isApiTokenValid } = loadTs('backend/src/auth.ts');

function note(id, nextDueAt, overrides = {}) {
  return {
    id,
    title: `Note ${id}`,
    body: overrides.body ?? `Body ${id}`,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    bucket: overrides.bucket ?? null,
    classificationStatus: 'pending',
    classificationMethod: 'unknown',
    classificationConfidence: null,
    widgetText: overrides.widgetText ?? null,
    echo: {
      enabled: true,
      state: overrides.state ?? 'new',
      lastReviewedAt: null,
      nextDueAt,
      intervalDays: 1,
      ease: 2.5,
      occurrenceCount: 0,
      scheduledDates: [nextDueAt.slice(0, 10)],
      ...overrides.echo,
    },
    filePath: null,
  };
}

function standing(id, text = `Standing ${id}`) {
  return {
    id,
    text,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  };
}

function state(overrides = {}) {
  return {
    recent: [],
    reviewed: [],
    checkIns: [],
    deletedNotes: [],
    bucketPreferences: { customs: [] },
    standingMessages: [],
    widgetPreferences: DEFAULT_WIDGET_PREFERENCES,
    ...overrides,
  };
}

test('due notes appear before standing messages and sort by nextDueAt', () => {
  const entries = createWidgetEntries(
    state({
      recent: [
        note('later', '2026-06-15T11:00:00.000Z'),
        note('earlier', '2026-06-15T09:00:00.000Z'),
      ],
      standingMessages: [standing('one')],
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['echo-earlier', 'echo-later', 'standing-one']
  );
});

test('reviewed notes due in the future do not appear', () => {
  const entries = createWidgetEntries(
    state({
      reviewed: [note('future', '2026-06-16T09:00:00.000Z', { state: 'reviewed' })],
      standingMessages: [standing('fallback')],
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ['standing-fallback']);
});

test('standing messages fill open widget slots', () => {
  const entries = createWidgetEntries(
    state({
      standingMessages: [standing('one'), standing('two'), standing('three'), standing('four')],
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['standing-one', 'standing-two', 'standing-three']
  );
});

test('bucketed due notes still appear in the widget', () => {
  const entries = createWidgetEntries(
    state({
      recent: [note('bucketed', '2026-06-15T09:00:00.000Z', { bucket: 'Research' })],
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ['echo-bucketed']);
});

test('disabled widget returns paused state', () => {
  const entries = createWidgetEntries(
    state({
      recent: [note('due', '2026-06-15T09:00:00.000Z')],
      standingMessages: [standing('fallback')],
      widgetPreferences: { enabled: false, includeStandingMessages: true },
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(entries, [
    {
      id: 'paused',
      kind: 'empty',
      text: PAUSED_WIDGET_TEXT,
      targetUrl: null,
    },
  ]);
});

test('empty widget returns no rows when standing messages are disabled', () => {
  const entries = createWidgetEntries(
    state({
      widgetPreferences: { enabled: true, includeStandingMessages: false },
      standingMessages: [standing('hidden')],
    }),
    { now: '2026-06-15T12:00:00.000Z' }
  );

  assert.deepEqual(entries, []);
});

test('widget text is compacted and capped', () => {
  const compacted = compactWidgetText(`  ${'Long '.repeat(80)}  `);

  assert.ok(compacted.length <= WIDGET_TEXT_LIMIT);
  assert.ok(compacted.endsWith('...'));
  assert.equal(/\s{2,}/.test(compacted), false);
});

test('timeline includes future due-date entries', () => {
  const timeline = createEchoWidgetTimelineProps(
    state({
      recent: [note('future', '2026-06-16T09:00:00.000Z')],
    }),
    new Date('2026-06-15T12:00:00.000Z')
  );

  assert.equal(timeline.length, 2);
  assert.deepEqual(
    timeline[1].props.entries.map((entry) => entry.id),
    ['echo-future']
  );
});

test('reviewing an echo advances to the next scheduled occurrence', () => {
  const reviewed = reviewEchoSchedule(
    {
      enabled: true,
      state: 'new',
      lastReviewedAt: null,
      nextDueAt: '2026-06-16T09:00:00.000Z',
      intervalDays: 1,
      ease: 2.5,
      occurrenceCount: 0,
      scheduledDates: ['2026-06-16', '2026-06-22'],
    },
    new Date('2026-06-16T12:00:00.000Z')
  );

  assert.equal(reviewed.enabled, true);
  assert.equal(reviewed.state, 'reviewed');
  assert.equal(reviewed.occurrenceCount, 1);
  assert.equal(reviewed.nextDueAt, new Date('2026-06-22T09:00:00').toISOString());
});

test('reviewing the final echo completes its schedule', () => {
  const reviewed = reviewEchoSchedule(
    {
      enabled: true,
      state: 'reviewed',
      lastReviewedAt: '2026-06-16T12:00:00.000Z',
      nextDueAt: '2026-06-22T09:00:00.000Z',
      intervalDays: 1,
      ease: 2.5,
      occurrenceCount: 1,
      scheduledDates: ['2026-06-16', '2026-06-22'],
    },
    new Date('2026-06-22T12:00:00.000Z')
  );

  assert.equal(reviewed.enabled, false);
  assert.equal(reviewed.occurrenceCount, 2);
  assert.equal(reviewed.nextDueAt, '2026-06-22T09:00:00.000Z');
});

test('API token authentication accepts only the configured bearer token', () => {
  const expected = 'a'.repeat(32);

  assert.equal(extractBearerToken(`Bearer ${expected}`), expected);
  assert.equal(isApiTokenValid(expected, expected), true);
  assert.equal(isApiTokenValid('b'.repeat(32), expected), false);
  assert.equal(isApiTokenValid(null, expected), false);
});
