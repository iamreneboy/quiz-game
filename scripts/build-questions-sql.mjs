// Writes supabase/seed.sql from supabase/questions/*.json, and optionally a
// migration. Run: node scripts/build-questions-sql.mjs [--migration <path>]
//
// It REFUSES to write an invalid bank. A generated artifact that a validator
// would reject is worse than no artifact: it would reach a database.

import { writeFileSync } from 'node:fs';
import { loadBank, validateBank, formatViolations } from './questionRules.mjs';
import { buildSeedFile, buildMigrationFile } from './questionSql.mjs';

const bank = loadBank();
const violations = validateBank(bank);
if (violations.length > 0) {
  console.error(formatViolations(violations));
  console.error('\nRefusing to generate SQL from an invalid bank.');
  process.exit(1);
}

writeFileSync('supabase/seed.sql', buildSeedFile(bank));
console.log(`wrote supabase/seed.sql (${bank.length} questions)`);

const i = process.argv.indexOf('--migration');
if (i !== -1) {
  const path = process.argv[i + 1];
  if (!path) { console.error('--migration needs a path'); process.exit(1); }
  writeFileSync(path, buildMigrationFile(bank));
  console.log(`wrote ${path} (${bank.length} questions)`);
}
