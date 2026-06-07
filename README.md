# gitiam

Atomic git identity switching for the shell.

## Motivation

In git, **authentication and authorship are independent**. A push succeeds when the SSH
key in your agent has permission on the remote — GitHub never checks that the commit's
`user.email` matches the account that owns the key. So with a stale
`user.email = work@company.com` left in your global git config, you can push to a personal
project, authenticated with your personal key, and still have the commit show up under
your work account. The key was valid; the authorship was wrong.

`gitiam` fixes this by treating identity as an atomic triple —
`(ssh_key_path, git_user_name, git_user_email)` — and applying all three together, never
partially. Switching identity loads the right SSH key into the agent and sets the matching
global `user.name` / `user.email` in one step.

## Requirements

- Node `>=24`
- macOS or Linux
- A running ssh-agent (`SSH_AUTH_SOCK` set in your environment)

## Installation

```bash
npm i -g gitiam
```

or with pnpm:

```bash
pnpm add -g gitiam
```

## Usage

### `gitiam add <name>`

Register a new identity interactively. Prompts for the SSH key path, git user name, and
git user email.

```
$ gitiam add personal
? Path to SSH key: ~/.ssh/id_ed25519_personal
? Git user name: wcardosos
? Git user email: wcardosos@gmail.com

✓ Identity "personal" added.
```

### `gitiam list`

List registered identities, marking the active one with `*`.

```
  NAME      USER                   EMAIL
  personal  wcardosos              wcardosos@gmail.com
* work      wagner-cardoso-matrix  wagner@matrix.com.br
```

### `gitiam use <name>`

Atomically apply an identity: clears the ssh-agent, loads the identity's SSH key, and sets
the global git `user.name` / `user.email`. Validation runs first — if the identity is
missing, its SSH key is unreadable, or the ssh-agent isn't running, nothing is changed.

```
$ gitiam use personal

✓ Active identity: personal
```

### `gitiam check`

Compare the active identity with the git identity resolved in the current directory (git's
full precedence chain: local → `includeIf` → global → system). Informative only — always
exits 0.

```
$ gitiam check
Active identity: personal
Current directory: /Users/wagner/projects/rulebox

✓ Local gitconfig matches active identity.
```

Add `--strict` to make it suitable for a pre-commit hook: silent on match (exit 0), and
exit 1 with a message on stderr when the resolved identity diverges (or when there is no
active identity).

### `gitiam remove <name>`

Remove a registered identity from the registry. Does not touch the ssh-agent or your git
config. If the removed identity was active, the active marker is cleared too.

```
$ gitiam remove old-job
? Remove identity "old-job"? (y/N) y
✓ Identity "old-job" removed.
```

Add `-y` / `--yes` to skip the confirmation prompt (useful in scripts).

### `gitiam` (no subcommand)

Show the active identity and a help hint.

```
$ gitiam
Active identity: personal
  user:    wcardosos
  email:   wcardosos@gmail.com
  ssh key: ~/.ssh/id_ed25519_personal

Run `gitiam --help` for available commands.
```

## Pre-commit hook

`gitiam check --strict` is silent and exits 0 when the resolved git identity matches the
active one, and exits 1 (with a message on stderr) when they diverge. That makes it a drop-in
guard for a pre-commit hook: a commit made under the wrong identity is blocked before it
lands.

The one-line script is the same everywhere:

```sh
#!/bin/sh
gitiam check --strict
```

**The hook is not auto-installed.** `gitiam` never writes to your repos' hooks — install it
manually using whichever of the following fits your setup.

### Raw `.git/hooks/pre-commit`

Create the file and make it executable:

```sh
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
gitiam check --strict
EOF
chmod +x .git/hooks/pre-commit
```

### husky

In `.husky/pre-commit`:

```sh
gitiam check --strict
```

### lefthook

In `lefthook.yml`:

```yaml
pre-commit:
  commands:
    gitiam:
      run: gitiam check --strict
```

## Platform note

`gitiam` supports macOS and Linux only. On Windows, run it under WSL — the CLI detects a
native Windows environment at startup and exits with a message suggesting WSL.

## License

MIT
