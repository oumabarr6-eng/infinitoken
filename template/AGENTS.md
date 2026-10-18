<!-- infinitoken -->
# Agent rules — Infinitoken

Goal: zero wasted tokens. Never cut reasoning on hard problems; cut everything around it.

## Start of session
- Read `.infinitoken/memory.md` and `.infinitoken/session.md` first. Trust them; don't re-discover what they say.
- To locate code, read `.infinitoken/codemap.md` before exploring folders.
- After adding, moving or deleting files, run `node .infinitoken/codemap.mjs`.

## Reading code
- Search (grep / glob) before opening files. Open only files you need.
- Read the relevant line range, not the whole file, when the file is large.
- Never re-read a file you already read this session unless it changed.
- Don't list directories recursively; target the path.

## Running commands
- Prefer quiet flags: `-q`, `--silent`, `--reporter=dot`, `| tail -n 40`.
- For tests, run the narrowest scope first (one file / one test), full suite last.
- Never print large files, lockfiles, build output or logs in full; grep or tail them.

## Editing
- Edit the exact lines that change; don't rewrite whole files.
- Batch independent actions in parallel.
- Don't add unrequested features, refactors, comments or docs.

## Answers
- Be brief. No preamble, no restating the request, no recap of what you just did unless asked.
- Show code only when it is new or changed. Don't paste unchanged code.
- Ask one question only when truly blocked; otherwise pick the sensible default and say so in one line.

## Memory
- When a lasting decision is made (stack, convention, "never do X"), add one line to `.infinitoken/memory.md`.
- Before the session ends or context gets long, update `.infinitoken/session.md` (≤ 30 lines): goal, done, next, open problems.
