@AGENTS.md

## Claude Code

- Before implementing any screen, load the `codi-mockup-parity` skill.
- When the task names a screen (S01…S41), flow (L*, T*, D*) or entity, open the matching section of
  `docs/mockup/PRODUCT.md` / `docs/mockup/STATE-MACHINES.md` with `Grep` (PRODUCT.md is ~130 KB — never read it whole).
- Treat a mismatch between existing code and the mockup's states as a bug in the code, unless the issue says otherwise.
- Never edit `docs/mockup/**` inside a feature branch. Ask the user instead.
