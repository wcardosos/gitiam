import { readActive, readIdentities } from '../config';
import { getResolvedEmail } from '../git';
import { ConfigError, GitError } from '../errors';
import { sym } from '../ui';
import type { Identity } from '../types';

export type CompareResult = 'no-active' | 'unset' | 'match' | 'mismatch';

/**
 * Pure comparison of the active identity's email against the email git
 * resolves in the current directory. No I/O — this is the unit-tested core.
 *
 * - `no-active`: there is no active identity to compare against.
 * - `unset`: git resolves no user.email (treated as divergence — alignment
 *   cannot be confirmed).
 * - `match` / `mismatch`: emails are equal / differ.
 */
export function compareIdentity(
  activeEmail: string | null,
  resolvedEmail: string | null
): CompareResult {
  if (activeEmail === null) return 'no-active';
  if (resolvedEmail === null) return 'unset';
  return activeEmail === resolvedEmail ? 'match' : 'mismatch';
}

function reportNoActive(strict: boolean, staleName: string | null): void {
  if (strict) {
    process.stderr.write('gitiam: no active identity\n');
    process.exit(1);
  }
  if (staleName !== null) {
    console.log(
      `Active identity "${staleName}" is not registered. Run \`gitiam use <name>\` to set a valid one.`
    );
  } else {
    console.log('No active identity. Run `gitiam use <name>` first.');
  }
}

function reportDefault(
  result: Exclude<CompareResult, 'no-active'>,
  identity: Identity,
  resolvedEmail: string | null
): void {
  const cwd = process.cwd();

  if (result === 'match') {
    console.log(`Active identity: ${identity.name}`);
    console.log(`Current directory: ${cwd}`);
    console.log('');
    console.log(`${sym.ok} Local gitconfig matches active identity.`);
    return;
  }

  console.log(`Active identity: ${identity.name} (${identity.gitUserEmail})`);
  console.log(`Current directory: ${cwd}`);
  console.log('');

  if (result === 'unset') {
    console.log(
      `${sym.warn} No user.email is resolved in this directory,\n` +
        `  so it cannot be confirmed to match the active identity (${identity.gitUserEmail}).\n`
    );
    console.log(
      `  Run \`gitiam use ${identity.name}\` to set it, or configure git user.email here.`
    );
    return;
  }

  console.log(
    `${sym.warn} Resolved user.email here is ${resolvedEmail},\n` +
      `  which differs from active identity (${identity.gitUserEmail}).\n`
  );
  console.log(
    `  Commits in this directory will be authored as ${resolvedEmail}.\n` +
      `  If this is intentional (e.g. includeIf by path), no action needed.\n` +
      `  Otherwise, run \`gitiam use <correct-identity>\` or remove the local override.`
  );
}

function reportStrict(
  result: Exclude<CompareResult, 'no-active'>,
  identity: Identity,
  resolvedEmail: string | null
): void {
  if (result === 'match') return; // silent success

  const resolved = result === 'unset' ? '(unset)' : resolvedEmail;
  process.stderr.write(
    `gitiam: identity mismatch in ${process.cwd()}\n` +
      `  active:   ${identity.name} (${identity.gitUserEmail})\n` +
      `  resolved: ${resolved}\n`
  );
  process.exit(1);
}

export async function checkCommand(options: { strict?: boolean } = {}): Promise<void> {
  const strict = options.strict ?? false;

  // Step 1: active identity name.
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
    reportNoActive(strict, null);
    return;
  }

  // Step 2: resolve the active name to a registered identity.
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
    reportNoActive(strict, activeName);
    return;
  }

  // Step 3: email git resolves in the current directory (full precedence chain).
  let resolvedEmail: string | null;
  try {
    resolvedEmail = await getResolvedEmail(process.cwd());
  } catch (err) {
    if (err instanceof GitError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // Step 4: compare. `identity` always has an email, so the result here is
  // never `no-active`.
  const result = compareIdentity(identity.gitUserEmail, resolvedEmail) as Exclude<
    CompareResult,
    'no-active'
  >;

  // Step 5: format per mode.
  if (strict) {
    reportStrict(result, identity, resolvedEmail);
  } else {
    reportDefault(result, identity, resolvedEmail);
  }
}
