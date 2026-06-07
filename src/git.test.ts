import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitError } from './errors';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';
import { setGlobalUser, getResolvedEmail } from './git';

const mockExecFile = vi.mocked(execFile);

function execSuccess(stdout = '', stderr = '') {
  mockExecFile.mockImplementation(((...args: unknown[]) => {
    const cb = args[args.length - 1] as (e: unknown, r: unknown) => void;
    cb(null, { stdout, stderr });
  }) as never);
}

function execFailure(stderr: string, code?: number | string) {
  mockExecFile.mockImplementation(((...args: unknown[]) => {
    const cb = args[args.length - 1] as (e: unknown) => void;
    cb(Object.assign(new Error('command failed'), { stderr, code }));
  }) as never);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('setGlobalUser', () => {
  it('issues two git config --global calls: user.name then user.email', async () => {
    execSuccess();
    await setGlobalUser('Alice', 'alice@example.com');
    expect(mockExecFile).toHaveBeenNthCalledWith(
      1,
      'git',
      ['config', '--global', 'user.name', 'Alice'],
      expect.any(Function)
    );
    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      'git',
      ['config', '--global', 'user.email', 'alice@example.com'],
      expect.any(Function)
    );
  });

  it('throws GitError when a call fails', async () => {
    execFailure('could not lock config file');
    await expect(setGlobalUser('Alice', 'alice@example.com')).rejects.toBeInstanceOf(GitError);
    await expect(setGlobalUser('Alice', 'alice@example.com')).rejects.toThrow('lock config');
  });
});

describe('getResolvedEmail', () => {
  it('returns the trimmed email on success', async () => {
    execSuccess('alice@example.com\n');
    await expect(getResolvedEmail('/repo')).resolves.toBe('alice@example.com');
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  it('returns null when git exits 1 with empty output (unset)', async () => {
    execFailure('', 1);
    await expect(getResolvedEmail('/repo')).resolves.toBeNull();
  });

  it('throws GitError when the git binary is missing (ENOENT)', async () => {
    execFailure('', 'ENOENT');
    await expect(getResolvedEmail('/repo')).rejects.toBeInstanceOf(GitError);
    await expect(getResolvedEmail('/repo')).rejects.toThrow('not installed');
  });

  it('throws GitError on a non-unset failure', async () => {
    execFailure('fatal: not a git repository', 128);
    await expect(getResolvedEmail('/repo')).rejects.toBeInstanceOf(GitError);
    await expect(getResolvedEmail('/repo')).rejects.toThrow('not a git repository');
  });
});
