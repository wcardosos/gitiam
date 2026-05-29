import pc from 'picocolors';
import { readIdentities, readActive } from '../config';
import { ConfigError } from '../errors';
import { sym } from '../ui';
import type { Identity } from '../types';

const EMPTY_MESSAGE =
  'No identities registered yet. Run `gitiam add <name>` to create one.';

export function formatList(identities: Identity[], active: string | null): string {
  if (identities.length === 0) return EMPTY_MESSAGE;

  const nameWidth = Math.max('NAME'.length, ...identities.map((i) => i.name.length));
  const userWidth = Math.max('USER'.length, ...identities.map((i) => i.gitUserName.length));

  const header =
    '  ' +
    pc.dim('NAME'.padEnd(nameWidth)) +
    '  ' +
    pc.dim('USER'.padEnd(userWidth)) +
    '  ' +
    pc.dim('EMAIL');

  const rows = identities.map((i) => {
    const isActive = i.name === active;
    const marker = isActive ? pc.green('*') + ' ' : '  ';
    const name = isActive
      ? pc.bold(i.name.padEnd(nameWidth))
      : pc.dim(i.name.padEnd(nameWidth));
    return (
      marker + name + '  ' + i.gitUserName.padEnd(userWidth) + '  ' + i.gitUserEmail
    );
  });

  return [header, ...rows].join('\n');
}

export async function listCommand(): Promise<void> {
  let identities: Identity[];
  try {
    identities = await readIdentities();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  if (identities.length === 0) {
    console.log(EMPTY_MESSAGE);
    return;
  }

  let active: string | null;
  try {
    active = await readActive();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log(formatList(identities, active));
}
