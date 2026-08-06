const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function resolveExisting(basePath) {
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, 'index.ts')];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Unable to resolve module: ${basePath}`);
  return found;
}

function loadTs(relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const { outputText } = ts.transpileModule(fs.readFileSync(absolutePath, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  });
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const dirname = path.dirname(absolutePath);
  const localRequire = (request) => {
    if (request.startsWith('@/')) return loadTs(resolveExisting(path.join(root, request.slice(2))));
    if (request.startsWith('.')) return loadTs(resolveExisting(path.resolve(dirname, request)));
    return require(request);
  };
  vm.runInThisContext(`(function (exports, require, module) { ${outputText}\n})`, {
    filename: absolutePath,
  })(module.exports, localRequire, module);
  return module.exports;
}

const {
  getLatestWeeklyReviewOccurrence,
  getPendingWeeklyReviewOccurrence,
  getPreviousWeeklyReview,
  getReflectionPrompt,
  isEveningCheckInDue,
} = loadTs('lib/weekly-reviews/schedule.ts');

function preferences(overrides = {}) {
  return {
    enabled: true,
    weekday: 1,
    hour: 18,
    minute: 0,
    startsAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function review(id, scheduledFor, overrides = {}) {
  return {
    id,
    scheduledFor,
    completedAt: scheduledFor,
    updatedAt: scheduledFor,
    reflection: `Reflection ${id}`,
    nextWeekIntent: `Plan ${id}`,
    ...overrides,
  };
}

test('weekly occurrence is unavailable before the configured start', () => {
  const result = getLatestWeeklyReviewOccurrence(
    preferences({ startsAt: '2026-08-09T19:00:00.000Z' }),
    new Date('2026-08-09T18:30:00.000Z')
  );
  assert.equal(result, null);
});

test('weekly occurrence chooses only the latest due week', () => {
  const config = preferences({ startsAt: '2026-08-01T00:00:00.000Z' });
  const result = getLatestWeeklyReviewOccurrence(config, new Date(2026, 7, 23, 20, 0));
  assert.ok(result);
  assert.equal(result.getDay(), 0);
  assert.equal(result.getHours(), 18);
  assert.equal(result.getDate(), 23);
});

test('completed latest occurrence is no longer pending', () => {
  const now = new Date(2026, 7, 9, 20, 0);
  const config = preferences({ startsAt: new Date(2026, 7, 1, 12, 0).toISOString() });
  const latest = getLatestWeeklyReviewOccurrence(config, now);
  assert.ok(latest);
  assert.equal(
    getPendingWeeklyReviewOccurrence(config, [review('done', latest.toISOString())], now),
    null
  );
});

test('previous plan uses the most recent review before the target occurrence', () => {
  const reviews = [
    review('older', '2026-07-26T18:00:00.000Z'),
    review('latest', '2026-08-02T18:00:00.000Z'),
  ];
  assert.equal(getPreviousWeeklyReview(reviews, '2026-08-09T18:00:00.000Z').id, 'latest');
});

test('evening reflection is due after 8 PM unless today has an evening check-in', () => {
  const now = new Date(2026, 7, 9, 20, 30);
  assert.equal(isEveningCheckInDue([], now), true);
  assert.equal(
    isEveningCheckInDue([
      {
        id: 'today',
        createdAt: new Date(2026, 7, 9, 19, 0).toISOString(),
        kind: 'evening',
        source: 'mobile',
        energy: 3,
        emotions: {},
        body: 'Done',
        filePath: null,
      },
    ], now),
    false
  );
  assert.equal(isEveningCheckInDue([], new Date(2026, 7, 9, 19, 59)), false);
});

test('weekly review wins prompt priority, then evening follows after weekly completion', () => {
  const now = new Date(2026, 7, 9, 20, 30);
  const config = preferences({ startsAt: new Date(2026, 7, 1, 12, 0).toISOString() });
  const weeklyPrompt = getReflectionPrompt(config, [], [], now);
  assert.equal(weeklyPrompt.kind, 'weekly-review');

  const completed = review('done', weeklyPrompt.scheduledFor);
  assert.deepEqual(getReflectionPrompt(config, [completed], [], now), {
    kind: 'evening-check-in',
  });
});
