import { describe, it, expect } from 'vitest';
import { removeIdentity } from './remove';
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

describe('removeIdentity', () => {
  it('removes the matching entry and reports removed: true', () => {
    const { next, removed } = removeIdentity(identities, 'work');
    expect(removed).toBe(true);
    expect(next.map((i) => i.name)).toEqual(['personal']);
  });

  it('returns removed: false and an unchanged list for an unknown name', () => {
    const { next, removed } = removeIdentity(identities, 'ghost');
    expect(removed).toBe(false);
    expect(next.map((i) => i.name)).toEqual(['personal', 'work']);
  });

  it('removes only the named entry and keeps the rest in order', () => {
    const three: Identity[] = [
      ...identities,
      {
        name: 'oss',
        sshKeyPath: '/home/user/.ssh/id_oss',
        gitUserName: 'wc-oss',
        gitUserEmail: 'oss@example.com',
      },
    ];
    const { next, removed } = removeIdentity(three, 'work');
    expect(removed).toBe(true);
    expect(next.map((i) => i.name)).toEqual(['personal', 'oss']);
  });

  it('returns removed: false and an empty list for an empty input', () => {
    const { next, removed } = removeIdentity([], 'work');
    expect(removed).toBe(false);
    expect(next).toEqual([]);
  });
});
