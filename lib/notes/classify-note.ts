import { BUCKETS, type BucketName } from '@/constants/buckets';

const AI_MODULE_NAME = 'ai';
const OPENAI_MODULE_NAME = '@ai-sdk/openai';
const ZOD_MODULE_NAME = 'zod';
const DEFAULT_BUCKET: BucketName = 'Reflections';

type GenerateObjectArgs = {
  model: unknown;
  schema: unknown;
  prompt: string;
  temperature?: number;
};

type GenerateObjectFn = (args: GenerateObjectArgs) => Promise<{ object?: { bucket?: string } }>;

type CreateOpenAIFn = (options: { apiKey: string }) => (model: string) => unknown;

function keywordScore(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => (text.includes(keyword) ? score + 1 : score), 0);
}

function classifyWithKeywords(body: string): BucketName {
  const text = body.toLowerCase();

  const scores: Record<BucketName, number> = {
    'Business Ideas': keywordScore(text, [
      'business',
      'startup',
      'pricing',
      'revenue',
      'market',
      'customer',
      'product',
      'feature',
      'freemium',
    ]),
    Reflections: keywordScore(text, [
      'reflect',
      'journal',
      'feeling',
      'learned',
      'insight',
      'mindset',
      'today',
      'thought',
    ]),
    'Game Dev': keywordScore(text, [
      'game',
      'level',
      'enemy',
      'player',
      'mechanic',
      'quest',
      'combat',
      'prototype',
    ]),
    Family: keywordScore(text, [
      'family',
      'kids',
      'parent',
      'home',
      'trip',
      'birthday',
      'partner',
      'dinner',
    ]),
    Systems: keywordScore(text, [
      'system',
      'workflow',
      'process',
      'automation',
      'setup',
      'infrastructure',
      'routine',
      'review',
    ]),
  };

  let topBucket = DEFAULT_BUCKET;
  let topScore = -1;

  for (const bucket of BUCKETS) {
    const score = scores[bucket];
    if (score > topScore) {
      topScore = score;
      topBucket = bucket;
    }
  }

  return topBucket;
}

async function classifyWithVercelAiSdk(body: string): Promise<BucketName | null> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const aiModule = (await import(AI_MODULE_NAME)) as {
      generateObject?: GenerateObjectFn;
    };
    const openAiModule = (await import(OPENAI_MODULE_NAME)) as {
      createOpenAI?: CreateOpenAIFn;
    };
    const zodModule = (await import(ZOD_MODULE_NAME)) as {
      z?: {
        object: (shape: Record<string, unknown>) => unknown;
        enum: (values: readonly [string, ...string[]]) => unknown;
      };
    };

    if (!aiModule.generateObject || !openAiModule.createOpenAI || !zodModule.z) {
      return null;
    }

    const openai = openAiModule.createOpenAI({ apiKey });
    const schema = zodModule.z.object({
      bucket: zodModule.z.enum(BUCKETS as unknown as readonly [string, ...string[]]),
    });

    const result = await aiModule.generateObject({
      model: openai('gpt-4o-mini'),
      schema,
      temperature: 0,
      prompt: [
        'You assign personal notes to exactly one bucket.',
        `Allowed buckets: ${BUCKETS.join(', ')}.`,
        'Return only the best matching bucket for the note text below.',
        '',
        body,
      ].join('\n'),
    });

    const bucket = result.object?.bucket;
    if (typeof bucket === 'string' && BUCKETS.includes(bucket as BucketName)) {
      return bucket as BucketName;
    }

    return null;
  } catch {
    return null;
  }
}

export async function classifyNoteBucket(body: string): Promise<BucketName> {
  const aiBucket = await classifyWithVercelAiSdk(body);
  if (aiBucket) return aiBucket;
  return classifyWithKeywords(body);
}
