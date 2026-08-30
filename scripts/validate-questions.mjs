// The bank's gate. Run: node scripts/validate-questions.mjs [--report]
//
// npm's `pretest` runs this, so `npm test` cannot pass over a defective bank;
// tests/questionBank.test.ts asserts the same thing, so `npx vitest run`
// cannot either. Neither alone covers how this repo is actually driven.

import { loadBank, validateBank, formatViolations, formatReport } from './questionRules.mjs';

const bank = loadBank();
const violations = validateBank(bank);

if (process.argv.includes('--report')) console.log(`${formatReport(bank)}\n`);

if (violations.length > 0) {
  console.error(`${violations.length} question bank violation(s):\n`);
  console.error(formatViolations(violations));
  process.exit(1);
}

console.log(`question bank OK — ${bank.length} questions`);
