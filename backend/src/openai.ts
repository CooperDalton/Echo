import OpenAI from 'openai';

import { BUCKETS, type BucketName, type Note } from './contracts';
import { env } from './config';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

type ClassificationResult = {
  bucket: BucketName;
  confidence: number;
  model: string;
};

type ClassificationPayload = {
  bucket: BucketName;
  confidence: number;
};

export async function classifyNote(
  note: Pick<Note, 'id' | 'title' | 'body' | 'createdAt' | 'updatedAt'>
): Promise<ClassificationResult> {
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
            bucket: {
              type: 'string',
              enum: [...BUCKETS],
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
          required: ['bucket', 'confidence'],
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
              `Allowed buckets: ${BUCKETS.join(', ')}.`,
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
  if (!BUCKETS.includes(parsed.bucket)) {
    throw new Error('OpenAI returned an invalid bucket.');
  }

  return {
    bucket: parsed.bucket,
    confidence: parsed.confidence,
    model: env.ECHO_OPENAI_MODEL,
  };
}
