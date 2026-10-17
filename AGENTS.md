# yogo75-driver

Reverse engineering of the ATK Yogo 75 PRO keyboard and its web configurator (`https://v3-hub.atk.store/`), to drive it with our own tools: the `yogo75` CLI, then a web app.

## Documentation

- **Protocol** (commands, config fields, transports, configurator): read `docs/protocol.md` before sending anything to the keyboard or searching `web-dump/`. Every discovery goes in as soon as it is made (configurator reading, keyboard test, disproved hypothesis), with its status (verified / code / hypothesis). It describes the protocol alone, not our tools: what each command and value does and what the keyboard can do, not a log of tests (no journal, no dated test log).
- **Language**: docs, README, commits, issues and PRs in English.

## Code

pnpm monorepo (`npx` is not installed): `apps/cli` (the CLI) and `packages/core` (`@yogo75/core`, the protocol, shared with the future web app). TypeScript run directly by Node 24, no build. Root scripts: `pnpm typecheck`, `pnpm test`, `pnpm format` (Prettier).

**Style**: read `CODESTYLE.md` before writing code.

Run the CLI from the repo root with `pnpm yogo75 …`: it reads and writes its backup files in the working directory. `pnpm yogo75 --help` is the command reference (`<command> --help` for its arguments); `yogo75 raw` sends one arbitrary packet for exploration.

`web-dump/` is an untrusted copy of the configurator site: read it, never run it. Its bundles are minified on a single line: search with `node -e` and a regex (e.g. `(?<![\w$])NAME=class`) rather than `grep`.

## Keyboard

- **Guardrail**: every write follows read → modify → write back. `0x31` (factory reset) and `0xA0`–`0xC0` (firmware flashing) need the user's explicit approval every time.
- **One process** at a time can open the keyboard: run `yogo75` commands one by one, never in parallel.
- **Transport**: the keyboard's physical switch picks cable, 2.4 GHz or Bluetooth (not configurable). In 2.4 GHz, the cable only charges. If the dongle stops answering (`no reply to cmd 0x10`), the keyboard is asleep: ask the user to press a key.
- **Visual check**: the user is the test's eyes. Tell them what to look at; for a subtle effect, have them compare two extreme values.
- **Stuck key** (malformed macro, interrupted stream): unplug and replug the keyboard; settings survive.

## Git

Work on a branch, delivered through a PR. Commit, push and open PRs only with the user's approval.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `chore`, `style`…): `docs(protocol): probable size of the macro area`.
