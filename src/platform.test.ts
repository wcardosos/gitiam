import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { CONFIG_DIR, IDENTITIES_FILE, ACTIVE_FILE, checkPlatform } from './platform';

describe('path constants', () => {
  it('CONFIG_DIR resolves under os.homedir()', () => {
    expect(CONFIG_DIR).toBe(path.join(os.homedir(), '.config', 'gitiam'));
  });

  it('IDENTITIES_FILE is inside CONFIG_DIR', () => {
    expect(IDENTITIES_FILE).toBe(path.join(CONFIG_DIR, 'identities.json'));
  });

  it('ACTIVE_FILE is inside CONFIG_DIR', () => {
    expect(ACTIVE_FILE).toBe(path.join(CONFIG_DIR, 'active'));
  });
});

describe('checkPlatform', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('does nothing on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    expect(() => checkPlatform()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('writes WSL message to stderr and exits 1 on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    checkPlatform();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('WSL'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
