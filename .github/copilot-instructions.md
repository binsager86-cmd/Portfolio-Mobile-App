## Commit Policy

- When preparing commits, exclude test files by default.
- Treat test-only changes as local scratch unless explicitly requested by the user.
- Exclude paths matching these patterns unless the user asks otherwise:
  - `**/__tests__/**`
  - `**/tests/**`
  - `**/*.test.*`
  - `**/*.spec.*`
- If test files are staged accidentally, unstage them before commit.
