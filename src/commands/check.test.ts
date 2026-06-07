import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config');
vi.mock('../git');

import * as config from '../config';
import * as git from '../git';
import { GitError, ConfigError } from '../errors';
import { checkCommand, compareIdentity } from './check';
import type { Identity } from '../types';

const mockConfig = vi.mocked(config);
const mockGit = vi.mocked(git);

const identities: Identity[] = [
  {
    name: 'personal',
    sshKeyPath: '~/.ssh/id_personal',
    gitUserName: 'wcardosos',
    gitUserEmail: 'wcardosos@gmail.com',
  },
];

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code);
  }) as never);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.spyOn(console, 'log').mockReturnValue(undefined);
});

describe('compareIdentity', () => {
  it('returns match for equal emails', () => {
    expect(compareIdentity('a@x.com', 'a@x.com')).toBe('match');
  });

  it('returns mismatch for differing emails', () => {
    expect(compareIdentity('a@x.com', 'b@x.com')).toBe('mismatch');
  });

  it('returns no-active when the active email is null', () => {
    expect(compareIdentity(null, 'a@x.com')).toBe('no-active');
  });

  it('returns unset when the resolved email is null', () => {
    expect(compareIdentity('a@x.com', null)).toBe('unset');
  });
});

describe('checkCommand — default mode', () => {
  it('exits 0 on match', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockResolvedValue('wcardosos@gmail.com');

    await expect(checkCommand({})).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('exits 0 on mismatch (informative, non-blocking)', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockResolvedValue('wagner@matrix.com.br');

    await expect(checkCommand({})).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
  });

  it('exits 0 when there is no active identity', async () => {
    mockConfig.readActive.mockResolvedValue(null);

    await expect(checkCommand({})).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(mockConfig.readIdentities).not.toHaveBeenCalled();
  });

  it('exits 0 when active points at an unregistered identity', async () => {
    mockConfig.readActive.mockResolvedValue('ghost');
    mockConfig.readIdentities.mockResolvedValue(identities);

    await expect(checkCommand({})).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(mockGit.getResolvedEmail).not.toHaveBeenCalled();
  });
});

describe('checkCommand — strict mode', () => {
  it('exits 0 silently on match', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockResolvedValue('wcardosos@gmail.com');

    await expect(checkCommand({ strict: true })).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('exits 1 and writes to stderr on mismatch', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockResolvedValue('wagner@matrix.com.br');

    await expect(checkCommand({ strict: true })).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('exits 1 on unset (null resolved email)', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockResolvedValue(null);

    await expect(checkCommand({ strict: true })).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('exits 1 when there is no active identity', async () => {
    mockConfig.readActive.mockResolvedValue(null);

    await expect(checkCommand({ strict: true })).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });
});

describe('checkCommand — errors', () => {
  it('exits 1 and writes to stderr when git is missing', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockGit.getResolvedEmail.mockRejectedValue(new GitError('git is not installed or not in PATH.'));

    await expect(checkCommand({})).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('exits 1 on a malformed config', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockRejectedValue(new ConfigError('invalid JSON'));

    await expect(checkCommand({})).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });
});
