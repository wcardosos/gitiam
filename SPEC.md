# gitiam — specification

## Context

`gitiam` is a CLI for atomic git identity switching in the shell. It solves one specific problem: commits authored with the wrong `user.name`/`user.email` when the SSH key in use is valid.

The concrete scenario that motivated the project: the ssh-agent has the correct key loaded (push authorized), but the local `.git/config` of a folder has the wrong `user.email` (from an old copy-paste, inherited repo, or forgotten config). The commit goes up, authorship appears under the wrong account in the GitHub history. SSH authorizes, but authorship is independent of SSH authentication — that's the gap.

`gitiam` models identity as an **atomic triple**: `(ssh_key_path, git_user_name, git_user_email)`. Activating an identity applies all three together, always. It also exposes a `check --strict` command designed to be used in a pre-commit hook, which fails the commit when the git identity resolved by the current folder diverges from the active identity in `gitiam`.

Stack aligned with `rulebox` (same TypeScript, same main libraries). Scope deliberately small: few commands, no premature abstractions, finished in a few hours.

---

## Tech stack

- **Language:** TypeScript
- **Build:** tsup (same as rulebox)
- **CLI:** commander
- **Interactivity:** @clack/prompts (used only in `add`)
- **Colors:** picocolors
- **Tests:** vitest (unit tests on config/ssh/git, no e2e)
- **Node stdlib:** `fs/promises`, `path`, `os`, `child_process` (use `execFile`/`spawn`, **never `exec`** — exec passes through a shell and risks injection with paths containing spaces)

No additional dependencies. Validations (path exists, email format, valid slug) are manual with regex/fs. No zod, no fs-extra, no execa.

### Platforms

macOS and Linux. Native Windows is out of scope for v1 — the CLI should detect Windows at startup and exit with a clear error suggesting WSL.

---

## Data model

An identity has 4 fields:

- `name`: slug-friendly string (alphanumeric + hyphen + underscore), unique.
- `sshKeyPath`: absolute string or with `~` (expand at runtime).
- `gitUserName`: free string (corresponds to `git config user.name`).
- `gitUserEmail`: string with email format (basic regex validation, only to catch gross typos).

### Storage

Two files in `~/.config/gitiam/`:

**`identities.json`** — identity registry:

```json
{
  "version": 1,
  "identities": [
    {
      "name": "personal",
      "sshKeyPath": "~/.ssh/id_ed25519_personal",
      "gitUserName": "wcardosos",
      "gitUserEmail": "wcardosos@gmail.com"
    },
    {
      "name": "work",
      "sshKeyPath": "~/.ssh/id_ed25519_work",
      "gitUserName": "wagner-cardoso-matrix",
      "gitUserEmail": "wagner@matrix.com.br"
    }
  ]
}
```

The `version` field is reserved for future schema migrations. Not used in v1, but present from the start to avoid pain later.

**`active`** — single-line file with the `name` of the active identity, or empty/nonexistent if there is no active identity.

### Configuration directory

Fixed path: `~/.config/gitiam/`. No `XDG_CONFIG_HOME` support in v1 — can come later if there's a real reason.

Create the directory automatically on first write. If permissions fail, error clearly with the path.

---

## Commands

### `gitiam` (no subcommand)

Shows the active identity + help hint. Always exit 0.

**With active identity:**

```
Active identity: personal
  user:    wcardosos
  email:   wcardosos@gmail.com
  ssh key: ~/.ssh/id_ed25519_personal

Run `gitiam --help` for available commands.
```

**Without active identity:**

```
No active identity. Run `gitiam use <name>` to activate one.

Run `gitiam --help` for available commands.
```

---

### `gitiam list`

Lists registered identities, marks the active one with `*`. Does not show ssh key in the output (visual noise).

**Normal case:**

```
  personal      wcardosos              wcardosos@gmail.com
* work          wagner-cardoso-matrix  wagner@matrix.com.br
```

**Empty list:**

```
No identities registered yet. Run `gitiam add <name>` to create one.
```

**Edge cases:**

- `identities.json` does not exist → treat as empty.
- `identities.json` malformed → error with file path and guidance message.

---

### `gitiam add <name>`

Registers an identity interactively via @clack/prompts.

**Flow:**

```
$ gitiam add personal
? Path to SSH key: ~/.ssh/id_ed25519_personal
? Git user name: wcardosos
? Git user email: wcardosos@gmail.com

✓ Identity "personal" added.
```

**Validations before saving (all inline during the prompt):**

- `name` slug-friendly: `/^[a-zA-Z0-9_-]+$/`. If invalid, prompt rejects.
- `name` cannot collide with existing one. If it does: error before the prompt starts, message "Identity 'personal' already exists. Use `gitiam remove` first or pick another name."
- `sshKeyPath` must exist and be readable (expand `~` before testing). If invalid, prompt rejects.
- `gitUserEmail` basic email format via simple regex. If invalid, prompt rejects.
- `gitUserName` any non-empty string.

**Edge cases:**

- Ctrl+C cancels without saving, exit 130 (Unix standard for SIGINT).
- `~/.config/gitiam/` directory does not exist → create.
- Permission failure on create/write → error with the path.

---

### `gitiam remove <name>`

Removes an identity. Does not touch ssh-agent or gitconfig — only deletes the registry entry.

**Flow:**

```
$ gitiam remove old-job
? Remove identity "old-job"? (y/N) y
✓ Identity "old-job" removed.
```

**Flags:**

- `-y` / `--yes` — skips confirmation. Useful for scripts.

**Edge cases:**

- Identity does not exist → error: "Identity 'old-job' not found. Run `gitiam list` to see registered identities." Exit 1.
- Removed identity was the active one → also clears `~/.config/gitiam/active` and warns: "Identity 'old-job' was active. No active identity now."

---

### `gitiam use <name>`

Core of the CLI. Activates an identity in two phases.

**Phase 1 — Pre-validation (fails before touching anything):**

- Does identity `<name>` exist in `identities.json`?
- Does `sshKeyPath` (with `~` expanded) exist and is readable?
- Is ssh-agent running? (`SSH_AUTH_SOCK` set in env)

If any validation fails, abort before modifying any state. Clear message with the problem.

**Phase 2 — Application (sequential, in order):**

1. `ssh-add -D` — clears all keys from the agent.
2. `ssh-add <expanded-sshKeyPath>` — loads the identity's key. If the key has a passphrase, `ssh-add` asks in the terminal (no interception from the CLI).
3. `git config --global user.name <gitUserName>`
4. `git config --global user.email <gitUserEmail>`
5. Writes `~/.config/gitiam/active` with `<name>`.

**Phase 3 — Automatic check at the end:**

Runs `gitiam check` automatically after phase 2. Always, no flag to disable. Ensures the user immediately sees if the current folder has a mismatch.

**Complete output:**

```
$ gitiam use personal

Validating...
  ✓ Identity "personal" found
  ✓ SSH key ~/.ssh/id_ed25519_personal exists and is readable
  ✓ ssh-agent is running

Applying...
  ✓ ssh-agent cleared
  ✓ SSH key loaded
  ✓ git config --global user.name = wcardosos
  ✓ git config --global user.email = wcardosos@gmail.com

✓ Active identity: personal

Checking current directory...
  ✓ Local gitconfig matches active identity.
```

**Edge cases:**

- Identity does not exist → error in validation. Exit 1.
- SSH key does not exist / not readable → error in validation. Exit 1.
- ssh-agent not running → error in validation with instruction: `eval "$(ssh-agent -s)"`. Exit 1.
- `ssh-add <key>` fails (wrong passphrase, invalid key) → **partial state accepted**: agent was already cleared by `ssh-add -D`, but the new key was not loaded. Clear message:
  ```
  ✗ Failed to add SSH key.
    Agent was cleared but new key not loaded.
    Run `ssh-add <key>` manually or `gitiam use <name>` again.
  ```
  Exit 1. **Does not attempt rollback** — re-adding the previous key would require knowing what was in the agent before, high complexity for a very rare case (wrong passphrase).
- `git config --global` fails → error, exit 1.

---

### `gitiam check`

Compares `user.email` resolved by git in the current folder (full resolution: local > includeIf > global) with the active identity.

Resolution is done via `git config user.email` executed in the current folder — this command applies git's full precedence chain (local override > included files via `includeIf` > global > system).

**Default mode — warning only, exit 0:**

**When it matches:**

```
$ gitiam check
Active identity: personal
Current directory: /Users/wagner/Desenvolvimento/wcardosos/rulebox

✓ Local gitconfig matches active identity.
```

**When it diverges:**

```
$ gitiam check
Active identity: personal (wcardosos@gmail.com)
Current directory: /Users/wagner/Desenvolvimento/zrp/some-repo

⚠ Resolved user.email here is wagner@matrix.com.br,
  which differs from active identity (wcardosos@gmail.com).

  Commits in this directory will be authored as wagner@matrix.com.br.
  If this is intentional (e.g. includeIf by path), no action needed.
  Otherwise, run `gitiam use <correct-identity>` or remove the local override.
```

**Without active identity:**

```
No active identity. Run `gitiam use <name>` first.
```

Exit 0 even in this case (default mode is informative, not blocking).

---

### `gitiam check --strict`

Same detection behavior, but different exit codes. Designed to run in a pre-commit hook.

**Behavior:**

- Match → exit 0, **silent** (no output). Unix convention: a successful command does not speak.
- Mismatch → exit 1, short message to `stderr`.
- No active identity → exit 1 with message "no active identity" (conservative — forces the user to have an active identity before committing).

**Error output (mismatch):**

```
gitiam: identity mismatch in /Users/wagner/Desenvolvimento/wcardosos/foo
  active:   personal (wcardosos@gmail.com)
  resolved: wagner@matrix.com.br
```

**Usage in pre-commit hook (reference, not auto-installed):**

```bash
#!/bin/sh
# .git/hooks/pre-commit (or via husky, lefthook, etc)
gitiam check --strict
```

The hook does not come with the CLI v1. Document how to install manually in the project README.

---

## Global error cases

Applicable to all commands:

- **Native Windows platform** → clear startup error: "gitiam doesn't support Windows natively. Use WSL." Exit 1.
- **Corrupt `identities.json`** → error with file path and suggestion: "Config file at <path> is invalid JSON. Fix manually or delete to start fresh."
- **Filesystem permissions** → error with the affected file path.

---

## Output conventions

- **Normal success:** informative messages to stdout, exit 0.
- **Silent success (`check --strict` on match):** no output, exit 0.
- **Errors:** message to stderr, non-zero exit code.
- **Colors via picocolors:**
  - `✓` green for success.
  - `⚠` yellow for warning.
  - `✗` red for error.
  - Identity names and paths with subtle emphasis (light gray or bold, no aggressive color).
- **No decorative emojis** beyond check/warning/cross. No ASCII art.

---

## Internal architecture

**Flat** style — no layers, no ports/adapters, no dependency injection. Five commands do not justify abstraction.

```
src/
├── index.ts          # bin entry: shebang, registers commands with commander
├── commands/
│   ├── default.ts    # gitiam (no subcommand)
│   ├── list.ts
│   ├── add.ts
│   ├── remove.ts
│   ├── use.ts
│   └── check.ts
├── config.ts         # read/write identities.json and active
├── ssh.ts            # ssh-add wrapper (-D, add key)
├── git.ts            # git config wrapper (set global, get resolved)
├── platform.ts       # platform detection, ~/.config/gitiam/ paths
├── ui.ts             # output helpers (colors, symbols)
└── types.ts          # Identity, Config, etc.
```

**Principles:**

- Files in `commands/` are **thin**: parse arguments, call utility functions, format output, set exit code.
- I/O logic isolated in `config.ts`, `ssh.ts`, `git.ts`. Pure functions where possible (take path/string, return data or effect), easier to test.
- No classes. Functions and types.
- `child_process.execFile` (not `exec`) to call `ssh-add` and `git`. Arguments as array, no concatenated strings.

---

## Testing strategy

Unit tests with vitest. Focus on critical points:

- **`config.ts`:** read/write `identities.json`, handle missing file, malformed file, schema validation.
- **`ssh.ts`:** parse `ssh-add` errors, path validation. Mock `child_process`.
- **`git.ts`:** parse output of `git config user.email`, handle folder without `.git/`, handle missing `git`.
- **`check` comparison logic:** given an active identity and a resolved value, returns match/mismatch correctly.

**Do not test:**

- E2E spawning the real binary.
- Real ssh-agent integration.
- Exact textual output (fragile, high cost, low value).

---

## Distribution

- Public npm package: **`gitiam`** (name confirmed available).
- `bin` in `package.json` pointing to the compiled entry.
- Shebang `#!/usr/bin/env node` at the entry file.
- README with installation (`npm i -g gitiam` or `pnpm add -g gitiam`), examples of each command, and a section about the pre-commit hook.

No Homebrew formula in v1. Can come later.

---

## What does NOT go in v1

Deliberate exclusion decisions:

- **Passphrase TTL/cache.** Passphrase typed every time if the key has one. `ssh-add -t` can come in v1.1.
- **ssh-agent rollback.** If `ssh-add` fails after `ssh-add -D`, partial state is accepted.
- **GPG signing key.** Identity is only SSH + git config. Signing can come in v1.1.
- **Native Windows.** WSL only.
- **Auto-installing the pre-commit hook.** User installs manually, CLI only exposes `check --strict`.
- **E2E or real ssh-agent integration tests.**
- **`XDG_CONFIG_HOME` support.** Fixed path at `~/.config/gitiam/`.
- **Multiple hosts (GitHub + GitLab + Bitbucket with different keys on the same identity).** One identity = one key. If you need different keys for different hosts, register separate identities or use `~/.ssh/config` per host.
- **Rename identity.** `remove` + `add` works. Can come in v1.1.
- **`edit` command.** Same reason as rename.
- **Listing with more details (`--verbose`).**

---

## Suggested build order

1. **Project setup:** TypeScript + tsup + commander + @clack/prompts + picocolors. `package.json` with `bin`, `tsup.config.ts`, `tsconfig.json`.
2. **`platform.ts` + `config.ts`:** functions to resolve `~/.config/gitiam/`, read/write `identities.json` and `active`. Unit tests.
3. **`gitiam list`:** first command, exercises `config.ts`. Tests end-to-end loop.
4. **`gitiam add`:** prompts via @clack, inline validations. Tests interactive flow.
5. **`gitiam remove`:** simple, depends on `config.ts`.
6. **`ssh.ts` + `git.ts`:** wrappers via `child_process.execFile`. Unit tests mocking.
7. **`gitiam use`:** orchestrates validation + application + check. The most complex command.
8. **`gitiam check`** (default and `--strict`).
9. **`gitiam`** with no subcommand (shows active).
10. **README + pre-commit hook example.**
11. **npm publication.**

Each step is testable in isolation. No need to wait for everything to be ready to have something usable.

---

## v1 success metrics

Concrete criteria to consider v1 closed:

- `gitiam add personal` registers an identity without error.
- `gitiam use personal` switches SSH key + global gitconfig in one execution.
- `gitiam check --strict` in a folder with `user.email` different from the active one returns exit 1.
- `gitiam check --strict` in an aligned folder returns exit 0 with no output.
- Pre-commit hook calling `gitiam check --strict` blocks the commit when there is a mismatch.
- Runs on macOS and Linux with no adjustment.
- `gitiam --help` lists all commands with clear description.
- Final bundle < 100KB (sanity check for minimal stack).