import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.string().default('development'),
  APP_HOST: z.string().default('127.0.0.1'),
  APP_PORT: z.coerce.number().int().positive().default(8001),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  JWT_SECRET: z.string().min(16).default('nubera-digital-dev-secret-2026-cambiar-en-prod'),
  JWT_EXPIRE_MINUTES: z.coerce.number().int().positive().default(480),
  LLM_PROVIDER: z.enum(['none', 'deepseek', 'openai', 'gemini']).default('none'),
  LLM_MODEL: z.string().default('deepseek-chat'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  DEEPSEEK_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default('local-384'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(384),
  GOOGLE_DRIVE_ENABLED: z.string().default('false').transform((v) => v === 'true'),
  GOOGLE_AUTH_MODE: z.enum(['oauth2', 'service_account']).default('oauth2'),
  GOOGLE_DRIVE_FOLDER_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_FILE: z.string().default('client_secret.json'),
  GOOGLE_OAUTH_TOKEN_FILE: z.string().default('token.json'),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default('http://localhost:8000/api/auth/google/callback'),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  TIMEZONE: z.string().default('America/Mexico_City'),
  ANALYST_CRON_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  ANALYST_CRON_MINUTE: z.coerce.number().int().min(0).max(59).default(0),
  INGESTION_CRON_HOUR: z.coerce.number().int().min(0).max(23).default(6),
  INGESTION_CRON_MINUTE: z.coerce.number().int().min(0).max(59).default(30),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  corsOriginsList: parsed.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
