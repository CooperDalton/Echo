import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  OPENAI_API_KEY: z.string().min(1),
  ECHO_OPENAI_MODEL: z.string().min(1).default('gpt-5-nano'),
  ECHO_API_TOKEN: z.string().min(32),
  ECHO_API_TOKEN_NEXT: z.string().min(32).optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
