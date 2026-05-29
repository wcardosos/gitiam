import { describe, it, expect } from 'vitest';
import { formatList } from './list';
import type { Identity } from '../types';

const identities: Identity[] = [
  {
    name: 'personal',
    sshKeyPath: '/home/user/.ssh/id_personal',
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

describe('formatList', () => {
  it('marks the active row with "* " and others with "  "', () => {
    const lines = formatList(identities, 'work').split('\n');
    const workLine = lines.find((l) => l.includes('wagner@matrix.com.br'))!;
    const personalLine = lines.find((l) => l.includes('wcardosos@gmail.com'))!;
    expect(workLine.startsWith('* ')).toBe(true);
    expect(personalLine.startsWith('  ')).toBe(true);
  });

  it('marks no row when there is no active identity', () => {
    const lines = formatList(identities, null).split('\n');
    expect(lines.every((l) => l.startsWith('  '))).toBe(true);
  });

  it('marks no row when the active name is not registered', () => {
    const lines = formatList(identities, 'ghost').split('\n');
    expect(lines.every((l) => l.startsWith('  '))).toBe(true);
  });

  it('does not render any SSH key path', () => {
    const out = formatList(identities, 'work');
    expect(out).not.toContain('/home/user/.ssh/id_personal');
    expect(out).not.toContain('/home/user/.ssh/id_work');
  });

  it('renders a header row that starts with "  " and labels every column', () => {
    const header = formatList(identities, 'work').split('\n')[0];
    expect(header.startsWith('  ')).toBe(true);
    expect(header).toContain('NAME');
    expect(header).toContain('USER');
    expect(header).toContain('EMAIL');
  });

  it('returns the guidance message for an empty list', () => {
    expect(formatList([], null)).toBe(
      'No identities registered yet. Run `gitiam add <name>` to create one.'
    );
  });
});
