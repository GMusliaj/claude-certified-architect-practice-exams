---
description: Search the web for new Claude exam materials and store them in the bank
argument-hint: [--topic agentic|tools|claudecode|prompting|context] [--query "..."] [--limit n] [--dry-run]
allowed-tools: Bash
---

Run the following command exactly as written, substituting $ARGUMENTS (leave empty to run all topics):

```bash
node scripts/tools/search_for_materials.js $ARGUMENTS
```

Report how many materials were saved and list the key points discovered per query.
