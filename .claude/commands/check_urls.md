---
description: Check all ref URLs in question banks for broken links
argument-hint: [--bank <foundations|agents|extraction|full>] [--concurrency <n>]
allowed-tools: Bash
---

Run the following command, substituting $ARGUMENTS:

```bash
node scripts/tools/check_urls.js $ARGUMENTS
```

Report broken URLs grouped by bank and question ID. For each broken link, suggest the correct URL based on the current Anthropic documentation structure (https://docs.anthropic.com/en/docs/...).
