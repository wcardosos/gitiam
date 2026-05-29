import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigError } from './errors';

vi.mock('node:fs/promises');
vi.mock('./platform', () => ({
  CONFIG_DIR: '/mock/.config/gitiam',
  IDENTITIES_FILE: '/mock/.config/gitiam/identities.json',
  ACTIVE_FILE: '/mock/.config/gitiam/active',
}));

import * as fs from 'node:fs/promises';
import {
  readIdentities,
  writeIdentities,
  readActive,
  writeActive,
  clearActive
} from './config';

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('readIdentities', () => {
  it('returns [] when file is missing', async () => {
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(readIdentities()).resolves.toEqual([]);
  });

  it('returns parsed identities from valid file', async () => {
    const identities = [
      { name: 'personal', sshKeyPath: '~/.ssh/id_rsa', gitUserName: 'Alice', gitUserEmail: 'alice@example.com' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify({ version: 1, identities }) as never);
    await expect(readIdentities()).resolves.toEqual(identities);
  });

  it('throws ConfigError on invalid JSON', async () => {
    mockFs.readFile.mockResolvedValue('not json' as never);
    await expect(readIdentities()).rejects.toBeInstanceOf(ConfigError);
    await expect(readIdentities()).rejects.toThrow('/mock/.config/gitiam/identities.json');
  });

  it('throws ConfigError when identities key is missing', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({ version: 1 }) as never);
    await expect(readIdentities()).rejects.toBeInstanceOf(ConfigError);
    await expect(readIdentities()).rejects.toThrow('/mock/.config/gitiam/identities.json');
  });

  it('throws ConfigError on non-read errors', async () => {
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    await expect(readIdentities()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('writeIdentities', () => {
  it('creates directory and writes file with version 1', async () => {
    mockFs.mkdir.mockResolvedValue(undefined as never);
    mockFs.writeFile.mockResolvedValue(undefined as never);

    const identities = [
      { name: 'work', sshKeyPath: '~/.ssh/work', gitUserName: 'Bob', gitUserEmail: 'bob@work.com' },
    ];
    await writeIdentities(identities);

    expect(mockFs.mkdir).toHaveBeenCalledWith('/mock/.config/gitiam', { recursive: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/mock/.config/gitiam/identities.json',
      expect.stringContaining('"version": 1'),
      'utf-8'
    );
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/mock/.config/gitiam/identities.json',
      expect.stringContaining('"identities"'),
      'utf-8'
    );
  });
});

describe('readActive', () => {
  it('returns null when file is missing', async () => {
    mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(readActive()).resolves.toBeNull();
  });

  it('returns trimmed name when file exists', async () => {
    mockFs.readFile.mockResolvedValue('personal\n' as never);
    await expect(readActive()).resolves.toBe('personal');
  });

  it('returns null for whitespace-only content', async () => {
    mockFs.readFile.mockResolvedValue('  \n' as never);
    await expect(readActive()).resolves.toBeNull();
  });
});

describe('writeActive', () => {
  it('creates directory and writes the name', async () => {
    mockFs.mkdir.mockResolvedValue(undefined as never);
    mockFs.writeFile.mockResolvedValue(undefined as never);

    await writeActive('personal');

    expect(mockFs.mkdir).toHaveBeenCalledWith('/mock/.config/gitiam', { recursive: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith('/mock/.config/gitiam/active', 'personal', 'utf-8');
  });
});

describe('clearActive', () => {
  it('resolves when file is successfully deleted', async () => {
    mockFs.unlink.mockResolvedValue(undefined as never);
    await expect(clearActive()).resolves.toBeUndefined();
  });

  it('resolves silently when file is already absent', async () => {
    mockFs.unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(clearActive()).resolves.toBeUndefined();
  });
});
