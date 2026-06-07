import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs/promises');
vi.mock('../config');
vi.mock('../ssh');
vi.mock('../git');

import * as fsp from 'node:fs/promises';
import * as config from '../config';
import * as ssh from '../ssh';
import * as git from '../git';
import { SshError, GitError } from '../errors';
import { useCommand } from './use';
import type { Identity } from '../types';

const mockFsp = vi.mocked(fsp);
const mockConfig = vi.mocked(config);
const mockSsh = vi.mocked(ssh);
const mockGit = vi.mocked(git);

const identities: Identity[] = [
  {
    name: 'personal',
    sshKeyPath: '~/.ssh/id_personal',
    gitUserName: 'wcardosos',
    gitUserEmail: 'wcardosos@gmail.com',
  },
  {
    name: 'work',
    sshKeyPath: '/home/user/.ssh/id_work',
    gitUserName: 'wagner-cardoso-matrix',
    gitUserEmail: 'wagner@matrix.com.br',
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

describe('useCommand', () => {
  it('exits 1 and applies nothing when the identity is unknown', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);

    await expect(useCommand('ghost')).rejects.toMatchObject({ code: 1 });

    expect(mockSsh.clearAgent).not.toHaveBeenCalled();
    expect(mockSsh.addKey).not.toHaveBeenCalled();
    expect(mockGit.setGlobalUser).not.toHaveBeenCalled();
    expect(mockConfig.writeActive).not.toHaveBeenCalled();
  });

  it('exits 1 and applies nothing when the SSH key is unreadable', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockRejectedValue(new Error('ENOENT'));

    await expect(useCommand('work')).rejects.toMatchObject({ code: 1 });

    expect(mockSsh.clearAgent).not.toHaveBeenCalled();
    expect(mockSsh.addKey).not.toHaveBeenCalled();
    expect(mockGit.setGlobalUser).not.toHaveBeenCalled();
    expect(mockConfig.writeActive).not.toHaveBeenCalled();
  });

  it('exits 1 and applies nothing when the ssh-agent is down', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockResolvedValue(undefined as never);
    mockSsh.isAgentRunning.mockReturnValue(false);

    await expect(useCommand('work')).rejects.toMatchObject({ code: 1 });

    expect(mockSsh.clearAgent).not.toHaveBeenCalled();
    expect(mockSsh.addKey).not.toHaveBeenCalled();
    expect(mockGit.setGlobalUser).not.toHaveBeenCalled();
    expect(mockConfig.writeActive).not.toHaveBeenCalled();
  });

  it('applies steps in order on the happy path with an expanded key path', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockResolvedValue(undefined as never);
    mockSsh.isAgentRunning.mockReturnValue(true);
    mockSsh.clearAgent.mockResolvedValue(undefined);
    mockSsh.addKey.mockResolvedValue(undefined);
    mockGit.setGlobalUser.mockResolvedValue(undefined);
    mockConfig.writeActive.mockResolvedValue(undefined);
    // Phase 3 runs the default-mode check after writeActive.
    mockConfig.readActive.mockResolvedValue('personal');
    mockGit.getResolvedEmail.mockResolvedValue('wcardosos@gmail.com');

    const order: string[] = [];
    mockSsh.clearAgent.mockImplementation(async () => {
      order.push('clearAgent');
    });
    mockSsh.addKey.mockImplementation(async () => {
      order.push('addKey');
    });
    mockGit.setGlobalUser.mockImplementation(async () => {
      order.push('setGlobalUser');
    });
    mockConfig.writeActive.mockImplementation(async () => {
      order.push('writeActive');
    });

    await useCommand('personal');

    expect(order).toEqual(['clearAgent', 'addKey', 'setGlobalUser', 'writeActive']);

    const expandedKey = path.join(os.homedir(), '.ssh/id_personal');
    expect(mockSsh.addKey).toHaveBeenCalledWith(expandedKey);
    expect(mockGit.setGlobalUser).toHaveBeenCalledWith('wcardosos', 'wcardosos@gmail.com');
    expect(mockConfig.writeActive).toHaveBeenCalledWith('personal');
  });

  it('still succeeds when the Phase 3 check finds a mismatch in the directory', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockResolvedValue(undefined as never);
    mockSsh.isAgentRunning.mockReturnValue(true);
    mockSsh.clearAgent.mockResolvedValue(undefined);
    mockSsh.addKey.mockResolvedValue(undefined);
    mockGit.setGlobalUser.mockResolvedValue(undefined);
    mockConfig.writeActive.mockResolvedValue(undefined);
    mockConfig.readActive.mockResolvedValue('personal');
    // Directory resolves a divergent email — Phase 3 warns but must not exit 1.
    mockGit.getResolvedEmail.mockResolvedValue('wagner@matrix.com.br');

    await expect(useCommand('personal')).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(mockConfig.writeActive).toHaveBeenCalledWith('personal');
  });

  it('exits 1 on addKey failure without setting git config or persisting active', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockResolvedValue(undefined as never);
    mockSsh.isAgentRunning.mockReturnValue(true);
    mockSsh.clearAgent.mockResolvedValue(undefined);
    mockSsh.addKey.mockRejectedValue(new SshError('wrong passphrase'));

    await expect(useCommand('work')).rejects.toMatchObject({ code: 1 });

    expect(mockSsh.clearAgent).toHaveBeenCalled();
    expect(mockGit.setGlobalUser).not.toHaveBeenCalled();
    expect(mockConfig.writeActive).not.toHaveBeenCalled();
  });

  it('exits 1 on setGlobalUser failure without persisting active', async () => {
    mockConfig.readIdentities.mockResolvedValue(identities);
    mockFsp.access.mockResolvedValue(undefined as never);
    mockSsh.isAgentRunning.mockReturnValue(true);
    mockSsh.clearAgent.mockResolvedValue(undefined);
    mockSsh.addKey.mockResolvedValue(undefined);
    mockGit.setGlobalUser.mockRejectedValue(new GitError('git not found'));

    await expect(useCommand('work')).rejects.toMatchObject({ code: 1 });

    expect(mockGit.setGlobalUser).toHaveBeenCalled();
    expect(mockConfig.writeActive).not.toHaveBeenCalled();
  });
});
