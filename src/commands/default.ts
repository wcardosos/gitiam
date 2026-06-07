import { readActive, readIdentities } from '../config';
import { ConfigError } from '../errors';
import { sym } from '../ui';
import type { Identity } from '../types';

const HELP_HINT = 'Run `gitiam --help` for available commands.';

const NO_ACTIVE_MESSAGE =
  'No active identity. Run `gitiam use <name>` to activate one.';

export function formatActive(identity: Identity): string {
  return [
    `Active identity: ${identity.name}`,
    `  user:    ${identity.gitUserName}`,
    `  email:   ${identity.gitUserEmail}`,
    `  ssh key: ${identity.sshKeyPath}`,
  ].join('\n');
}

export async function defaultCommand(): Promise<void> {
  let activeName: string | null;
  try {
    activeName = await readActive();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  if (activeName === null) {
    console.log(NO_ACTIVE_MESSAGE);
    console.log('');
    console.log(HELP_HINT);
    return;
  }

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

  const identity = identities.find((i) => i.name === activeName);
  if (!identity) {
    // Stale `active` pointing at an unregistered name — only reachable via
    // manual edits, since `remove` clears `active`.
    console.log(
      `Active identity "${activeName}" is not registered. Run \`gitiam use <name>\` to set a valid one.`
    );
    console.log('');
    console.log(HELP_HINT);
    return;
  }

  console.log(formatActive(identity));
  console.log('');
  console.log(HELP_HINT);
}
