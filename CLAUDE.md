# CLAUDE.md — gitiam

Guidance for Claude (and Claude Code) when working on this repository.

## Project overview

`gitiam` is a CLI for atomic git identity switching. It solves one specific problem: commits authored under the wrong `user.name`/`user.email` when the SSH key in the agent happens to be valid.

The core insight is that **authentication (SSH) and authorship (commit metadata) are independent in git**. GitHub accepts a push if the SSH key has permission, without verifying that the commit's `user.email` matches the account owning the key. So you can push from a personal project, authenticated with your personal key, but with a stale `user.email = work@company.com` in `.git/config` — and the commit will appear under the work account in the repo history.

`gitiam` models identity as an **atomic triple**: `(ssh_key_path, git_user_name, git_user_email)`. Activating an identity applies all three together, never partially. It also exposes `check --strict` for use in a pre-commit hook, which fails the commit when the resolved git identity in the current directory diverges from the active identity.

For full functional specification, see `SPEC.md` in the project root. That document is the source of truth for behavior — this file is the source of truth for **how to work on the code**.

## Tech stack

- **Language:** TypeScript
- **Build:** tsup
- **CLI framework:** commander
- **Interactivity:** @clack/prompts (used only in `add`)
- **Colors:** picocolors
- **Tests:** vitest (unit tests on config/ssh/git, no e2e)
- **Node stdlib:** `fs/promises`, `path`, `os`, `child_process`

No additional dependencies. Validations (path exists, email format, slug shape) are done manually with regex and fs. Do not introduce zod, fs-extra, execa, chalk, or similar libraries — the stack is intentionally minimal.

## Repository structure

Flat layout. No layers, no ports/adapters, no DI. Five commands do not justify abstraction.

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

### Layer responsibilities

- `commands/` files are **thin**: parse arguments, call utility functions, format output, set exit code. No business logic here.
- `config.ts`, `ssh.ts`, `git.ts` isolate I/O. Prefer pure functions where possible (take path/string, return data or effect).
- No classes. Functions and types.
- Side effects are concentrated in `ssh.ts`, `git.ts`, and `config.ts`. Everything else stays pure.

## Critical implementation rules

These are non-negotiable. The CLI's value depends on getting these right.

### Use `execFile`/`spawn`, never `exec`

`exec` passes the command through a shell, which makes paths with spaces or special characters unsafe. Always use `execFile` or `spawn` with arguments as an array.

```ts
// CORRECT
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
await exec("ssh-add", [keyPath]);

// WRONG
import { exec } from "node:child_process";
await exec(`ssh-add ${keyPath}`); // shell injection risk
```

### Expand `~` manually

Node does not expand `~` in paths. Always expand it explicitly using `os.homedir()` before passing paths to `fs` or `child_process`.

### Validate before applying in `gitiam use`

The `use` command has two strict phases:

1. **Validation phase** — check that the identity exists, the SSH key file exists and is readable, and the ssh-agent is running. If anything fails, abort **before** modifying any state.
2. **Application phase** — `ssh-add -D`, then `ssh-add <key>`, then `git config --global user.name/email`, then write `~/.config/gitiam/active`.

Never run application steps if validation fails. This is the core guarantee of the CLI.

### Partial state after `ssh-add` failure is accepted

If `ssh-add -D` succeeds but `ssh-add <key>` fails (e.g., wrong passphrase), the agent is cleared but no new key is loaded. **Do not attempt rollback.** Print a clear error message indicating the partial state and exit with code 1. Re-adding the previous key would require knowing what was loaded before, which is complexity not worth it for this edge case.

### Detect ssh-agent via `SSH_AUTH_SOCK`

Check `process.env.SSH_AUTH_SOCK` to determine if the agent is running. If unset or pointing to a nonexistent socket, error out with the standard instruction: `eval "$(ssh-agent -s)"`.

### `git config user.email` resolves the full chain

When `check` reads the current resolved identity in a directory, do not parse `.git/config` manually. Run `git config user.email` from the target directory — git itself applies the full precedence chain (local → includeIf → global → system). Parsing it ourselves would re-implement git's resolution and get edge cases wrong.

### Exit codes follow Unix conventions

- Success: exit 0.
- Generic error: exit 1.
- SIGINT (Ctrl+C from prompts): exit 130.
- `gitiam check --strict` on match: exit 0, **silent** (no stdout). On mismatch: exit 1, message to stderr.

### Windows is not supported in v1

On startup, detect `process.platform === "win32"` and exit with a clear message suggesting WSL. Do not attempt to support Windows natively.

## Storage

Two files in `~/.config/gitiam/`:

- `identities.json` — registered identities (object with `version` and `identities` array). `version` field is reserved for future schema migrations, currently always `1`.
- `active` — single-line file containing the name of the active identity, or absent if no identity is active.

Create the directory automatically on first write. On permission errors, error with the path.

`XDG_CONFIG_HOME` is not supported in v1. Use the fixed path `~/.config/gitiam/`.

## Working philosophy

These principles guide how to evolve this codebase. They mirror the project owner's stated preferences and are not negotiable for cosmetic or stylistic reasons.

### Cut, do not add

The default move when something is unclear is to **cut scope**, not to add abstraction. If a feature is not in `SPEC.md`, it does not belong in v1. The "What does NOT go in v1" section of that document lists explicit exclusions — treat them as decisions, not as TODOs.

### No premature abstraction

Do not introduce interfaces, factories, strategy patterns, or dependency injection unless there is a concrete second implementation that requires them. The current code has five commands and three I/O wrappers. That is not enough complexity to justify any architectural layering.

### Incremental and concrete

Prefer working code over speculative design. When extending the CLI, write the simplest implementation that satisfies the spec, then refactor only if a real second use case emerges.

### Explicit over clever

Code that reads linearly top-to-bottom is preferred over code that requires jumping between abstractions to understand. Verbose explicit checks beat clever one-liners.

### Match existing patterns

Before introducing a new pattern (new file naming, new error handling style, new way to structure a command), look at how existing files do it and follow that pattern. Consistency matters more than micro-optimization.

## Testing strategy

Unit tests with vitest. Focus on critical points:

- **`config.ts`** — read/write `identities.json`, handle missing file, malformed file, schema validation.
- **`ssh.ts`** — parse `ssh-add` errors, path validation. Mock `child_process`.
- **`git.ts`** — parse `git config user.email` output, handle folders without `.git/`, handle missing `git` binary.
- **Check comparison logic** — given an active identity and a resolved value, return match/mismatch correctly.

Do **not** test:

- End-to-end with real binary spawning.
- Real ssh-agent integration.
- Exact textual output (fragile, high cost, low value).

## Commands during development

```bash
# Install dependencies
npm install

# Run in dev mode (rebuilds on change)
npm run dev

# Build for distribution
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type-check without emitting
npm run typecheck
```

The compiled binary is run from `dist/index.js` after `npm run build`. The shebang `#!/usr/bin/env node` makes it executable directly.

For local testing of the global install behavior, use `npm link` from the project root.

## Distribution

- Public npm package: **`gitiam`**.
- `bin` field in `package.json` points to the compiled entry.
- Shebang `#!/usr/bin/env node` at the top of the entry file.
- README covers installation (`npm i -g gitiam`), command examples, and pre-commit hook setup.

No Homebrew formula in v1.

## What NOT to do

Decisions deliberately excluded from v1 — do not implement these without an explicit conversation:

- Passphrase TTL/caching (`ssh-add -t`).
- ssh-agent rollback on failed `ssh-add`.
- GPG signing key as part of identity.
- Native Windows support.
- Auto-installing the pre-commit hook.
- E2E or real ssh-agent integration tests.
- `XDG_CONFIG_HOME` support.
- Multiple SSH keys per identity (one identity = one key).
- `rename` or `edit` commands (use `remove` + `add`).
- Verbose listing flags.

When in doubt, refuse to add scope. The project value is in being small and reliable, not feature-rich.