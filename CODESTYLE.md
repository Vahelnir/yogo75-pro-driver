# Code style

Prettier handles formatting (`pnpm format`); this file covers the rest.

## Syntax

- _Erasable-only_ TypeScript: Node 24 strips types without a build, so no `enum`, `namespace` or parameter properties (`constructor(private x)`). Private fields are `#field`.
- Functions exported by a module are declared with `function`, with an explicit return type. Arrow functions are for callbacks and small local helpers that are not exported.
- Bit operations and magic numbers sit behind a function or constant whose name says what they do (`u16le(offset)`, `rgb565(r, g, b)`, `HEADER_BYTES`), not inline in the logic.

## Layout

- In every workspace, code lives in `src/` and tests in `test/`.
- One module per topic (`bytes`, `packet`, `color`, `macro`…); `index.ts` only re-exports.
- `@yogo75/core` also runs in the browser: it imports nothing from Node (`node:*`, `Buffer`, `node-hid`) and works on `Uint8Array`; its `tsconfig`, without Node types, enforces this. All protocol knowledge (bytes, commands, formats) lives there; the CLI only parses arguments, reads and writes files, and prints.
- One request at a time per `Keyboard`: chain the `await`s (a `for` loop). `Promise.all` would interleave packets on the same HID link.

## Comments

Comment only where the code is complex, may not do what a reader expects, or handles a special case (a keyboard or hub quirk, a protocol fact the code cannot show). Code that reads clearly gets no comment.

- In English, short but understandable on its own.
- When the knowledge comes from the configurator, name the hub function it comes from ("as the hub's setMacro builds it").
- A deliberate shortcut: `// shortcut: <the limit>, <when to revisit>`.

## Tests

- `node:test` and `node:assert/strict`, `*.test.ts` files.
- Test the core's public API through the fake keyboard (`packages/core/test/fake-transport.ts`, which answers with the bytes of a real backup): assert on packets sent and values returned, not on internal helpers.
