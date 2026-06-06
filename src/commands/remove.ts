import { confirm, isCancel } from '@clack/prompts';
import { readIdentities, writeIdentities, readActive, clearActive } from '../config';
import { ConfigError } from '../errors';
import { sym } from '../ui';
import type { Identity } from '../types';

export function removeIdentity(
  identities: Identity[],
  name: string
): { next: Identity[]; removed: boolean } {
  const next = identities.filter((i) => i.name !== name);
  return { next, removed: next.length !== identities.length };
}

export async function removeCommand(
  name: string,
  options: { yes?: boolean }
): Promise<void> {
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

  if (!identities.some((i) => i.name === name)) {
    process.stderr.write(
      `${sym.err} Identity "${name}" not found. Run \`gitiam list\` to see registered identities.\n`
    );
    process.exit(1);
  }

  if (!options.yes) {
    const result = await confirm({
      message: `Remove identity "${name}"?`,
      initialValue: false,
    });
    if (isCancel(result)) {
      process.exit(130);
    }
    if (result === false) {
      console.log(`Cancelled. Identity "${name}" not removed.`);
      return;
    }
  }

  let wasActive: boolean;
  try {
    wasActive = (await readActive()) === name;
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  try {
    await writeIdentities(removeIdentity(identities, name).next);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  if (wasActive) {
    await clearActive();
  }

  console.log(`${sym.ok} Identity "${name}" removed.`);
  if (wasActive) {
    console.log(`${sym.warn} Identity "${name}" was active. No active identity now.`);
  }
}
