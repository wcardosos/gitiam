# gitiam

[![npm version](https://img.shields.io/npm/v/@wcardosos/gitiam.svg)](https://www.npmjs.com/package/@wcardosos/gitiam)
[![license](https://img.shields.io/npm/l/@wcardosos/gitiam.svg)](./LICENSE)
![CI](https://github.com/wcardosos/gitiam/actions/workflows/ci.yml/badge.svg)

Atomic git identity switching for the shell.

```bash
npm i -g @wcardosos/gitiam
gitiam add personal      # register an identity
gitiam use personal      # apply it: ssh key + user.name + user.email
gitiam check             # verify what git actually resolves here
```

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

## Why not just `includeIf`?

`includeIf` switches `user.name` / `user.email` by directory, which solves authorship —
but it has no idea which SSH key is loaded in your agent. You can still push to a personal
repo authenticated by a work key. `gitiam` binds the key to the identity so the two can't
drift apart.

The two are not mutually exclusive — see [Working alongside `includeIf`](#working-alongside-includeif).

## Requirements

- Node `>=20`
- macOS or Linux
- A running ssh-agent (`SSH_AUTH_SOCK` set in your environment)

## Installation

```bash
npm i -g @wcardosos/gitiam
```

or with pnpm:

```bash
pnpm add -g @wcardosos/gitiam
```

## Usage

### `gitiam add <name>`

Register a new identity interactively. Prompts for the SSH key path, git user name, and
git user email.

```
$ gitiam add personal
? Path to SSH key: ~/.ssh/id_ed25519_personal
? Git user name: octocat
? Git user email: octocat@example.com

✓ Identity "personal" added.
```

### `gitiam list`

List registered identities, marking the active one with `*`.

```
  NAME      USER          EMAIL
* personal  octocat       octocat@example.com
  work      octocat-work  octocat@work.example.com
```

### `gitiam use <name>`

Atomically apply an identity: clears the ssh-agent, loads the identity's SSH key, and sets
the global git `user.name` / `user.email`. Validation runs first — if the identity is
missing, its SSH key is unreadable, or the ssh-agent isn't running, nothing is changed.

```
$ gitiam use personal
Validating...
✓ Identity "personal" exists
✓ SSH key readable at /home/octocat/.ssh/id_ed25519_personal
✓ ssh-agent is running
Applying...
✓ Cleared ssh-agent and loaded /home/octocat/.ssh/id_ed25519_personal
✓ Set git user.name and user.email
✓ Active identity: personal

Checking current directory...
Active identity: personal
Current directory: /home/octocat/projects/my-app

✓ Local gitconfig matches active identity.
```

The last block is `gitiam check` run automatically in the current directory, so a
directory whose identity diverges from the one you just activated says so immediately. It
is informational only — the check result never changes `use`'s exit code.

> **Warning**
> `gitiam use` clears the ssh-agent before loading the identity's key. It runs `ssh-add -D`,
> which removes **every** identity from the agent — including keys that have nothing to do
> with git, such as ones you use for servers or deploys. Those keys must be re-added
> manually (`ssh-add ~/.ssh/that_key`). This is deliberate: it guarantees that only the
> active identity's key can authenticate a push.

Only the running agent is emptied — nothing on disk is touched, and your other key files
stay where they are.

The clear happens in the application phase, after every validation has passed, so a `use`
that fails validation leaves the agent exactly as it was. If the clear itself succeeds but
loading the new key fails — a wrong passphrase is the usual cause — the agent is left
**empty** and `gitiam` does not roll back. It reports the partial state and exits 1; fix
the cause and re-run `gitiam use <name>`.

**Passphrase-protected keys need an askpass helper.** See
[Troubleshooting](#gitiam-use-hangs-or-fails-on-a-passphrase-protected-key).

### `gitiam check`

Compare the active identity with the git identity resolved in the current directory (git's
full precedence chain: local → `includeIf` → global → system). Informative only — always
exits 0.

```
$ gitiam check
Active identity: personal
Current directory: /home/octocat/projects/my-app

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
  user:    octocat
  email:   octocat@example.com
  ssh key: /home/octocat/.ssh/id_ed25519_personal

Run `gitiam --help` for available commands.
```

## What gitiam writes to your system

`gitiam` keeps its state in two files under `~/.config/gitiam/`, and otherwise touches only
the ssh-agent and your global git config:

| What | Where | Written by |
|---|---|---|
| Identity registry | `~/.config/gitiam/identities.json` | `add`, `remove` |
| Active identity marker | `~/.config/gitiam/active` | `use` (written), `remove` (cleared when the removed identity was the active one) |
| ssh-agent contents | in memory, via `ssh-add` | `use` |
| Global git config | `user.name` / `user.email` in `~/.gitconfig` | `use` |

The directory is created automatically on the first write. `list`, `check`, and `gitiam`
with no subcommand only read.

### `identities.json`

Plain JSON, pretty-printed. `version` is reserved for future schema migrations and is
currently always `1`:

```json
{
  "version": 1,
  "identities": [
    {
      "name": "personal",
      "sshKeyPath": "/home/octocat/.ssh/id_ed25519_personal",
      "gitUserName": "octocat",
      "gitUserEmail": "octocat@example.com"
    }
  ]
}
```

`sshKeyPath` is stored as an absolute path — a `~` typed during `gitiam add` is expanded
and resolved at registration time, so moving the key means re-adding the identity.

The registry holds **only the path to your private key, never its contents**. `gitiam`
checks that the file is readable and then hands the path to `ssh-add`; it never opens,
copies, or transmits key material. Both files are created with your default umask
(typically `0644`) — they carry your name, email, and key locations, but no secrets.

### `active`

A single line containing the name of the active identity, or absent when no identity is
active. It is a pointer, not a copy: `gitiam` looks the name up in the registry, so editing
`identities.json` by hand keeps the active marker valid as long as the name still exists.

### What it never touches

`gitiam` does not write anything inside your repositories: no hooks, no `.git/config`, no
local or `includeIf` settings. `gitiam use` writes at the **global** level only, and
`gitiam check` is read-only — it asks git itself (`git config user.email`, run in the
current directory) which identity actually resolves there.

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

## Working alongside `includeIf`

Git resolves identity by precedence: local → `includeIf` → global → system. `gitiam use`
writes to the **global** level, which means a directory covered by an `includeIf` rule
will keep using that rule's identity, not the active one.

This is not a bug — the two tools solve different halves of the problem. `includeIf`
switches *authorship* by directory but cannot touch the ssh-agent; `gitiam` switches
authorship *and* authentication together, globally.

If you use both, `gitiam check` is what keeps them honest: it reports the identity git
actually resolves in the current directory, so a mismatch between your `includeIf` rule
and the loaded SSH key surfaces before you commit. When the divergence is intentional,
`gitiam check` says so rather than treating it as an error:

```
$ gitiam check
Active identity: personal (octocat@example.com)
Current directory: /home/octocat/work/some-repo

⚠ Resolved user.email here is octocat@work.example.com,
  which differs from active identity (octocat@example.com).

  Commits in this directory will be authored as octocat@work.example.com.
  If this is intentional (e.g. includeIf by path), no action needed.
  Otherwise, run `gitiam use <correct-identity>` or remove the local override.
```

Note that `--strict` makes no such allowance: in a pre-commit hook, any divergence from the
active identity fails the commit. If you rely on `includeIf` for a set of repositories,
install the hook only where you want the active identity enforced.

## Exit codes

The CLI is meant to run inside hooks and scripts, so its exit codes are part of the
contract:

| Code | Meaning |
|---|---|
| `0` | Success. Also `gitiam check` without `--strict`, always — including when it reports a divergence |
| `1` | Any failure: unknown identity, unreadable SSH key, no ssh-agent, `ssh-add` failure, `git config` failure, unreadable or malformed registry, running on Windows — and `gitiam check --strict` when the resolved identity diverges |
| `130` | An interactive prompt was cancelled with Ctrl+C (`add`, `remove`) |

There is no dedicated code per failure kind: every error path exits `1`, with a message on
stderr describing what happened.

## Troubleshooting

### `ssh-agent is not running`

Start one and export the socket:

```bash
eval "$(ssh-agent -s)"
```

On macOS, add `AddKeysToAgent yes` to `~/.ssh/config` to persist keys across sessions.

### `Cannot read SSH key at <path>`

Check the path and its permissions — private keys must be `0600` and owned by you. Note
that `gitiam` resolved `~` to an absolute path when the identity was registered, so a key
that has since moved will fail here. Re-register it with `gitiam remove <name>` followed by
`gitiam add <name>`.

### `gitiam use` hangs or fails on a passphrase-protected key

`gitiam` runs `ssh-add` as a child process with piped stdin, so `ssh-add` cannot detect a
terminal and will never prompt you for the passphrase where you can type it. What you see
depends on your environment:

- with `DISPLAY` set, `ssh-add` tries to launch an askpass program and fails immediately —
  `ssh_askpass: exec(/usr/bin/ssh-askpass): No such file or directory`;
- with `DISPLAY` unset, it waits for input that can never arrive and **hangs**. Ctrl+C out
  of it — and remember the agent has already been cleared at that point.

The fix is to give `ssh-add` an askpass helper and tell it to use one unconditionally:

```bash
export SSH_ASKPASS=/usr/bin/ssh-askpass   # or 1Password, ksshaskpass, etc.
export SSH_ASKPASS_REQUIRE=force          # OpenSSH >= 8.4
```

With those set, `gitiam use` loads a passphrase-protected key normally. Keys without a
passphrase need none of this.

### Push still shows the wrong account

Run `gitiam check` inside the repository. A local `.git/config` or an `includeIf` rule
takes precedence over what `gitiam use` sets — see
[Working alongside `includeIf`](#working-alongside-includeif).

## Platform note

`gitiam` supports macOS and Linux only. On Windows, run it under WSL — the CLI detects a
native Windows environment at startup and exits with a message suggesting WSL.

## Uninstall

```bash
npm uninstall -g @wcardosos/gitiam
rm -rf ~/.config/gitiam
```

Your global git config is left as-is — clear it manually with
`git config --global --unset user.email` if you want. Keys loaded in the ssh-agent are
unaffected; they disappear when the agent does.

## Contributing

Issues and pull requests are welcome.

```bash
git clone https://github.com/wcardosos/gitiam
cd gitiam
npm install
npm test
```

Please open an issue before starting work on a larger change.

## License

MIT — see [LICENSE](./LICENSE).
