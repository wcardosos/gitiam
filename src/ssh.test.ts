import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SshError } from './errors';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: vi.fn() }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: vi.fn(() => '/home/alice'),
}));

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAgentRunning, clearAgent, addKey } from './ssh';

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);

// Drive the callback-style execFile that promisify wraps.
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

const origSock = process.env.SSH_AUTH_SOCK;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (origSock === undefined) delete process.env.SSH_AUTH_SOCK;
  else process.env.SSH_AUTH_SOCK = origSock;
});

describe('isAgentRunning', () => {
  it('is true when SSH_AUTH_SOCK is set and the socket exists', () => {
    process.env.SSH_AUTH_SOCK = '/tmp/agent.sock';
    mockExistsSync.mockReturnValue(true);
    expect(isAgentRunning()).toBe(true);
  });

  it('is false when SSH_AUTH_SOCK is unset', () => {
    delete process.env.SSH_AUTH_SOCK;
    expect(isAgentRunning()).toBe(false);
  });

  it('is false when SSH_AUTH_SOCK is set but the socket is missing', () => {
    process.env.SSH_AUTH_SOCK = '/tmp/agent.sock';
    mockExistsSync.mockReturnValue(false);
    expect(isAgentRunning()).toBe(false);
  });
});

describe('clearAgent', () => {
  it('calls ssh-add with -D and resolves on success', async () => {
    execSuccess();
    await expect(clearAgent()).resolves.toBeUndefined();
    expect(mockExecFile).toHaveBeenCalledWith('ssh-add', ['-D'], expect.any(Function));
  });

  it('throws SshError with the stderr message on failure', async () => {
    execFailure('Could not open a connection to your authentication agent.');
    await expect(clearAgent()).rejects.toBeInstanceOf(SshError);
    await expect(clearAgent()).rejects.toThrow('authentication agent');
  });
});

describe('addKey', () => {
  it('expands ~ and calls ssh-add with the absolute path', async () => {
    execSuccess();
    await addKey('~/.ssh/id_rsa');
    expect(mockExecFile).toHaveBeenCalledWith(
      'ssh-add',
      ['/home/alice/.ssh/id_rsa'],
      expect.any(Function)
    );
  });

  it('throws SshError on a failed add (wrong passphrase)', async () => {
    execFailure('Bad passphrase, try again');
    await expect(addKey('/abs/key')).rejects.toBeInstanceOf(SshError);
    await expect(addKey('/abs/key')).rejects.toThrow('Bad passphrase');
  });
});
