import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { CONFIG_DIR, IDENTITIES_FILE, ACTIVE_FILE } from './platform';
import { ConfigError } from './errors';
import type { Identity } from './types';

export async function readIdentities(): Promise<Identity[]> {
  let raw: string;
  try {
    raw = await readFile(IDENTITIES_FILE, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new ConfigError(`Failed to read config at ${IDENTITIES_FILE}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Config file at ${IDENTITIES_FILE} is invalid JSON. Fix manually or delete to start fresh.`
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('identities' in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).identities)
  ) {
    throw new ConfigError(
      `Config file at ${IDENTITIES_FILE} is invalid JSON. Fix manually or delete to start fresh.`
    );
  }

  return (parsed as { identities: Identity[] }).identities;
}

export async function writeIdentities(identities: Identity[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(IDENTITIES_FILE, JSON.stringify({ version: 1, identities }, null, 2), 'utf-8');
}

export async function readActive(): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(ACTIVE_FILE, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ConfigError(`Failed to read active file at ${ACTIVE_FILE}: ${(err as Error).message}`);
  }

  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export async function writeActive(name: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(ACTIVE_FILE, name, 'utf-8');
}

export async function clearActive(): Promise<void> {
  try {
    await unlink(ACTIVE_FILE);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
