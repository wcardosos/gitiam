import { access, constants } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readIdentities, writeActive } from '../config';
import { isAgentRunning, clearAgent, addKey } from '../ssh';
import { setGlobalUser } from '../git';
import { ConfigError, SshError, GitError } from '../errors';
import { sym } from '../ui';
import { checkCommand } from './check';
import type { Identity } from '../types';

export async function useCommand(name: string): Promise<void> {
  // Phase 1: pre-validation. No application step runs until every check passes.
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

  const identity = identities.find((i) => i.name === name);
  if (!identity) {
    process.stderr.write(
      `${sym.err} Identity "${name}" not found. Run \`gitiam list\` to see registered identities.\n`
    );
    process.exit(1);
  }

  const expanded = identity.sshKeyPath.startsWith('~')
    ? path.join(os.homedir(), identity.sshKeyPath.slice(1))
    : identity.sshKeyPath;
  try {
    await access(expanded, constants.R_OK);
  } catch {
    process.stderr.write(
      `${sym.err} Cannot read SSH key at ${expanded}. Check the path and permissions.\n`
    );
    process.exit(1);
  }

  if (!isAgentRunning()) {
    process.stderr.write(
      `${sym.err} ssh-agent is not running. Start it with: eval "$(ssh-agent -s)"\n`
    );
    process.exit(1);
  }

  console.log('Validating...');
  console.log(`${sym.ok} Identity "${name}" exists`);
  console.log(`${sym.ok} SSH key readable at ${expanded}`);
  console.log(`${sym.ok} ssh-agent is running`);

  // Phase 2: sequential application. Validation has passed; apply atomically.
  try {
    await clearAgent();
  } catch (err) {
    if (err instanceof SshError) {
      process.stderr.write(`${sym.err} Failed to clear ssh-agent: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  try {
    await addKey(expanded);
  } catch (err) {
    if (err instanceof SshError) {
      process.stderr.write(
        `${sym.err} Failed to load SSH key: ${err.message}\n` +
          `${sym.warn} ssh-agent was cleared but the new key was not loaded. Re-run \`gitiam use ${name}\` after fixing the issue.\n`
      );
      process.exit(1);
    }
    throw err;
  }

  try {
    await setGlobalUser(identity.gitUserName, identity.gitUserEmail);
  } catch (err) {
    if (err instanceof GitError) {
      process.stderr.write(`${sym.err} Failed to set git config: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  try {
    await writeActive(name);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log('Applying...');
  console.log(`${sym.ok} Cleared ssh-agent and loaded ${expanded}`);
  console.log(`${sym.ok} Set git user.name and user.email`);
  console.log(`${sym.ok} Active identity: ${name}`);

  // Phase 3: surface any mismatch in the current directory. Informational
  // only — the check result never changes `use`'s exit code.
  console.log('');
  console.log('Checking current directory...');
  await checkCommand();
}
