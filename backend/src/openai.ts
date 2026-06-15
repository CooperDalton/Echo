import OpenAI from 'openai';

import type { BucketDraft, BucketName, Note } from './contracts';
import { env } from './config';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

type ClassificationResult = {
  title: string;
  bucket: BucketName;
  confidence: number;
  model: string;
};

type ClassificationPayload = {
  title: string;
  bucket: BucketName;
  confidence: number;
};

type WidgetShorteningPayload = {
  widgetText: string;
};

function normalizeTitle(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/g, '');
  if (compact.length <= 26) return compact;
  return compact.slice(0, 26).trimEnd();
}

export async function classifyNote(
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>,
  buckets: BucketDraft[]
): Promise<ClassificationResult> {
  const availableBuckets = buckets
    .map((bucket) => ({
      ...bucket,
      name: bucket.name.trim(),
      description: bucket.description.trim(),
    }))
    .filter((bucket) => bucket.name.length > 0);
  const bucketNames = availableBuckets.map((bucket) => bucket.name);

  if (bucketNames.length === 0) {
    throw new Error('No buckets are configured.');
  }

  const response = await client.responses.create({
    model: env.ECHO_OPENAI_MODEL,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'echo_note_bucket',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 26,
            },
            bucket: {
              type: 'string',
              enum: bucketNames,
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
          required: ['title', 'bucket', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: [
              'You assign a personal note to exactly one bucket.',
              'Generate a short note title that fits on one mobile card line beside a bucket pill.',
              'If the note is already very short, use the note text itself instead of inventing a separate title.',
              'Keep the title natural, specific, and concise.',
              'Use 2 to 5 words when possible.',
              'Hard cap: 26 characters including spaces.',
              'Do not add quotation marks or trailing punctuation.',
              `Allowed buckets: ${availableBuckets
                .map((bucket) =>
                  bucket.description
                    ? `${bucket.name}: ${bucket.description}`
                    : bucket.name
                )
                .join('\n')}`,
              'Return JSON only, following the schema exactly.',
              'Use the note title and body to choose the best bucket.',
            ].join('\n'),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(note),
          },
        ],
      },
    ],
  });

  if (!response.output_text) {
    throw new Error('OpenAI did not return structured output.');
  }

  const parsed = JSON.parse(response.output_text) as ClassificationPayload;
  if (!bucketNames.includes(parsed.bucket)) {
    throw new Error('OpenAI returned an invalid bucket.');
  }
  const title = normalizeTitle(parsed.title);
  if (!title) {
    throw new Error('OpenAI returned an invalid title.');
  }

  return {
    title,
    bucket: parsed.bucket,
    confidence: parsed.confidence,
    model: env.ECHO_OPENAI_MODEL,
  };
}

export async function shortenWidgetNote(
  note: Pick<Note, 'id' | 'title' | 'body'>,
  maxLength: number
): Promise<{ widgetText: string; model: string }> {
  const response = await client.responses.create({
    model: env.ECHO_OPENAI_MODEL,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'echo_widget_text',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            widgetText: {
              type: 'string',
              minLength: 1,
              maxLength,
            },
          },
          required: ['widgetText'],
          additionalProperties: false,
        },
      },
    },
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: [
              'Shorten a personal note for an iOS home screen widget.',
              'Preserve the exact meaning of the original note.',
              'Do not add interpretation, advice, labels, metadata, or emphasis.',
              `Hard cap: ${maxLength} characters.`,
              'Return JSON only, following the schema exactly.',
            ].join('\n'),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(note),
          },
        ],
      },
    ],
  });

  if (!response.output_text) {
    throw new Error('OpenAI did not return widget text.');
  }

  const parsed = JSON.parse(response.output_text) as WidgetShorteningPayload;
  const widgetText = parsed.widgetText.replace(/\s+/g, ' ').trim();
  if (!widgetText || widgetText.length > maxLength) {
    throw new Error('OpenAI returned invalid widget text.');
  }

  return {
    widgetText,
    model: env.ECHO_OPENAI_MODEL,
  };
}
