import { access } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { group, text } from '@clack/prompts';
import { readIdentities, writeIdentities } from '../config';
import { ConfigError } from '../errors';
import { sym } from '../ui';
import type { Identity } from '../types';

export function isValidSlug(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function validateSshKeyPath(raw: string): Promise<string | undefined> {
  const expanded = raw.startsWith('~')
    ? path.join(os.homedir(), raw.slice(1))
    : raw;
  try {
    await access(expanded, constants.R_OK);
    return undefined;
  } catch {
    return `Cannot read SSH key at ${expanded}. Check the path and permissions.`;
  }
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export function normalizeSshKeyPath(raw: string): string {
  return path.resolve(expandHome(raw));
}

export async function addCommand(name: string): Promise<void> {
  if (!isValidSlug(name)) {
    process.stderr.write(
      `${sym.err} Invalid name "${name}". Use letters, numbers, hyphens, or underscores only.\n`
    );
    process.exit(1);
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

  if (identities.some((i) => i.name === name)) {
    process.stderr.write(
      `${sym.err} Identity "${name}" already exists. Use \`gitiam remove\` first or pick another name.\n`
    );
    process.exit(1);
  }

  const answers = await group(
    {
      sshKeyPath: () =>
        text({
          message: 'SSH key path',
          placeholder: '~/.ssh/id_rsa',
          validate: (v) => {
            if (!v?.trim()) return 'Path cannot be empty.';
            const expanded = expandHome(v);
            try {
              accessSync(expanded, constants.R_OK);
            } catch {
              return `Cannot read SSH key at ${expanded}. Check the path and permissions.`;
            }
          },
        }),
      gitUserName: () =>
        text({
          message: 'Git user name',
          validate: (v) => (v?.trim() ? undefined : 'Name cannot be empty.'),
        }),
      gitUserEmail: () =>
        text({
          message: 'Git user email',
          validate: (v) =>
            v && isValidEmail(v) ? undefined : 'Enter a valid email address.',
        }),
    },
    { onCancel: () => process.exit(130) }
  );

  try {
    await writeIdentities([
      ...identities,
      {
        name,
        sshKeyPath: normalizeSshKeyPath(answers.sshKeyPath),
        gitUserName: answers.gitUserName.trim(),
        gitUserEmail: answers.gitUserEmail,
      },
    ]);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${sym.err} ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`${sym.ok} Identity "${name}" added.`);
}
