---
description: Generate new exam questions from the materials bank and append them to a question bank
argument-hint: --bank <foundations|agents|extraction|full> [--count n] [--material path] [--no-verify] [--dry-run]
allowed-tools: Bash
---

Run the following command exactly as written, substituting $ARGUMENTS:

```bash
node scripts/tools/generate_questions.js $ARGUMENTS
```

After the command completes, report:
1. How many questions were generated and appended
2. The pattern name and domain of each new question
3. Any questions that were flagged and removed by the verification pass
4. The new total question count for the bank
