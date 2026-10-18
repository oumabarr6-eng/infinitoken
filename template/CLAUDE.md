<!-- infinitoken -->
@AGENTS.md

## Claude Code specifics
- Use `/save` before ending a session and `/resume` to start one.
- Delegate wide searches and log reading to a subagent so only the conclusion enters this context.
- When context gets long, run `/save`, then `/clear` and `/resume` instead of continuing a bloated session.
