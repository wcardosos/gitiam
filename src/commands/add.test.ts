import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs/promises');
import * as fsp from 'node:fs/promises';

import {
  isValidSlug,
  isValidEmail,
  validateSshKeyPath,
  normalizeSshKeyPath,
} from './add';

const mockFsp = vi.mocked(fsp);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isValidSlug', () => {
  it('accepts simple lowercase name', () => {
    expect(isValidSlug('personal')).toBe(true);
  });

  it('accepts name with hyphen', () => {
    expect(isValidSlug('work-dev')).toBe(true);
  });

  it('accepts name with underscore and digits', () => {
    expect(isValidSlug('id_2')).toBe(true);
  });

  it('accepts single letter', () => {
    expect(isValidSlug('a')).toBe(true);
  });

  it('accepts mixed case', () => {
    expect(isValidSlug('MyWork')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('rejects name with dot', () => {
    expect(isValidSlug('my.id')).toBe(false);
  });

  it('rejects name with space', () => {
    expect(isValidSlug('my id')).toBe(false);
  });

  it('rejects name with forward slash', () => {
    expect(isValidSlug('org/work')).toBe(false);
  });

  it('rejects name with unicode character', () => {
    expect(isValidSlug('café')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts minimal valid email', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('accepts standard email', () => {
    expect(isValidEmail('user@domain.com')).toBe(true);
  });

  it('accepts email with plus sign', () => {
    expect(isValidEmail('foo+bar@x.io')).toBe(true);
  });

  it('rejects email with no @', () => {
    expect(isValidEmail('nodomain.com')).toBe(false);
  });

  it('rejects email with no dot after domain', () => {
    expect(isValidEmail('user@nodot')).toBe(false);
  });

  it('rejects email with leading space', () => {
    expect(isValidEmail(' user@domain.com')).toBe(false);
  });

  it('rejects bare @', () => {
    expect(isValidEmail('@only')).toBe(false);
  });
});

describe('validateSshKeyPath', () => {
  it('returns undefined when key exists and is readable', async () => {
    mockFsp.access.mockResolvedValue(undefined as never);
    const result = await validateSshKeyPath('/home/user/.ssh/id_rsa');
    expect(result).toBeUndefined();
  });

  it('returns error string when key is not found', async () => {
    mockFsp.access.mockRejectedValue(new Error('ENOENT'));
    const result = await validateSshKeyPath('/nonexistent/key');
    expect(typeof result).toBe('string');
    expect(result).toContain('/nonexistent/key');
  });

  it('expands ~ to homedir before calling fs.access', async () => {
    mockFsp.access.mockResolvedValue(undefined as never);
    await validateSshKeyPath('~/.ssh/key');
    const expectedPath = path.join(os.homedir(), '.ssh/key');
    expect(mockFsp.access).toHaveBeenCalledWith(expectedPath, expect.any(Number));
  });
});

describe('normalizeSshKeyPath', () => {
  it('expands a ~-based path to an absolute homedir path', () => {
    expect(normalizeSshKeyPath('~/.ssh/id_rsa')).toBe(
      path.join(os.homedir(), '.ssh/id_rsa')
    );
  });

  it('resolves a relative path to an absolute path', () => {
    expect(normalizeSshKeyPath('.ssh/file')).toBe(path.resolve('.ssh/file'));
  });

  it('leaves an already-absolute path unchanged', () => {
    expect(normalizeSshKeyPath('/home/u/.ssh/k')).toBe('/home/u/.ssh/k');
  });
});
