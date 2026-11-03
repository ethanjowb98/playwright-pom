import { config } from 'dotenv';

config({ quiet: true });

const DEFAULT_BASE_URL = 'https://www.qacloud.dev';

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env (local) or set the GitHub secret (CI).`,
    );
  }
  return value;
}

/** Typed access to environment configuration. Secrets are read lazily so `--list` and typecheck work without them. */
export const env = {
  baseURL: optional('QACLOUD_BASE_URL', DEFAULT_BASE_URL),
  isCI: Boolean(process.env.CI),
  get username(): string {
    return required('QACLOUD_USERNAME');
  },
  get password(): string {
    return required('QACLOUD_PASSWORD');
  },
};
