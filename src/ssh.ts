import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { SshError } from './errors';

const exec = promisify(execFile);

function parseStderr(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const stderr = e.stderr?.trim();
  return stderr || e.message || 'Unknown error.';
}

export function isAgentRunning(): boolean {
  const sock = process.env.SSH_AUTH_SOCK;
  if (!sock) return false;
  return existsSync(sock);
}

export async function clearAgent(): Promise<void> {
  try {
    await exec('ssh-add', ['-D']);
  } catch (err) {
    throw new SshError(parseStderr(err));
  }
}

export async function addKey(keyPath: string): Promise<void> {
  const expanded = keyPath.startsWith('~')
    ? path.join(os.homedir(), keyPath.slice(1))
    : keyPath;
  try {
    await exec('ssh-add', [expanded]);
  } catch (err) {
    throw new SshError(parseStderr(err));
  }
}
