import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config');

import * as config from '../config';
import { ConfigError } from '../errors';
import { defaultCommand, formatActive } from './default';
import type { Identity } from '../types';

const mockConfig = vi.mocked(config);

const identity: Identity = {
  name: 'personal',
  sshKeyPath: '~/.ssh/id_ed25519_personal',
  gitUserName: 'wcardosos',
  gitUserEmail: 'wcardosos@gmail.com',
};

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

describe('formatActive', () => {
  it('renders the detail block with aligned labels and all values', () => {
    const out = formatActive(identity);
    expect(out).toContain('Active identity: personal');
    expect(out).toContain('user:    wcardosos');
    expect(out).toContain('email:   wcardosos@gmail.com');
    expect(out).toContain('ssh key: ~/.ssh/id_ed25519_personal');
  });

  it('prints the ssh key path as stored, without expanding ~', () => {
    expect(formatActive(identity)).toContain('~/.ssh/id_ed25519_personal');
  });
});

describe('defaultCommand', () => {
  it('prints the detail branch and exits 0 with an active identity', async () => {
    mockConfig.readActive.mockResolvedValue('personal');
    mockConfig.readIdentities.mockResolvedValue([identity]);

    await expect(defaultCommand()).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
    const logged = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('Active identity: personal');
  });

  it('prints the no-active branch without reading identities', async () => {
    mockConfig.readActive.mockResolvedValue(null);

    await expect(defaultCommand()).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    expect(mockConfig.readIdentities).not.toHaveBeenCalled();
    const logged = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('No active identity.');
  });

  it('prints the stale branch naming the identity when active is unregistered', async () => {
    mockConfig.readActive.mockResolvedValue('ghost');
    mockConfig.readIdentities.mockResolvedValue([identity]);

    await expect(defaultCommand()).resolves.toBeUndefined();

    expect(process.exit).not.toHaveBeenCalled();
    const logged = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('"ghost"');
    expect(logged).toContain('is not registered');
  });

  it('exits 1 and writes to stderr on a malformed config', async () => {
    mockConfig.readActive.mockRejectedValue(new ConfigError('invalid JSON'));

    await expect(defaultCommand()).rejects.toMatchObject({ code: 1 });

    expect(process.stderr.write).toHaveBeenCalled();
  });
});
