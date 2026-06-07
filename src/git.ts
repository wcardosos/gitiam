import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitError } from './errors';

const exec = promisify(execFile);

function parseStderr(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const stderr = e.stderr?.trim();
  return stderr || e.message || 'Unknown error.';
}

export async function setGlobalUser(name: string, email: string): Promise<void> {
  try {
    await exec('git', ['config', '--global', 'user.name', name]);
    await exec('git', ['config', '--global', 'user.email', email]);
  } catch (err) {
    throw new GitError(parseStderr(err));
  }
}

export async function getResolvedEmail(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['config', 'user.email'], { cwd });
    return stdout.trim();
  } catch (err) {
    const e = err as { code?: number | string; stderr?: string };
    if (e.code === 1 && !e.stderr?.trim()) return null;
    if (e.code === 'ENOENT') throw new GitError('git is not installed or not in PATH.');
    throw new GitError(parseStderr(err));
  }
}
