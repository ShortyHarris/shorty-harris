#!/usr/bin/env node
// Writes the "Release checks" summary shown on each GitHub Actions run: every check with its
// result, test counts, the failing tests with their messages, and the overall release verdict.
// Usage: node scripts/ci/report.mjs <junit.xml> [db-tests.tap]
//   (step outcomes come from env: TYPECHECK, TESTS, BUILD, LINT, DBTESTS)
import { existsSync, readFileSync } from 'node:fs';

const icon = (o) => ({ success: 'Passed', failure: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped' }[o] ?? 'Not run');
const checks = [
  ['Type check', process.env.TYPECHECK],
  ['Unit and component tests', process.env.TESTS],
  ['Production build', process.env.BUILD],
  ['Lint (no new errors)', process.env.LINT],
  ['Database tests (pgTAP, fresh database)', process.env.DBTESTS],
];

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => decode((new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag) ?? [])[1] ?? '');

let total = 0, failed = 0, skipped = 0;
const failures = [];
const file = process.argv[2];
if (file && existsSync(file)) {
  const xml = readFileSync(file, 'utf8');
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    total++;
    const body = m[3] ?? '';
    if (/<skipped/.test(body)) { skipped++; continue; }
    const f = /<failure\b([^>]*)>?([\s\S]*?)(<\/failure>|$)/.exec(body);
    if (f) {
      failed++;
      const msg = (attr(f[1], 'message') || decode(f[2])).split('\n').slice(0, 4).join(' ').slice(0, 400);
      failures.push(`- **${attr(m[1], 'classname')} > ${attr(m[1], 'name')}**: ${msg}`);
    }
  }
}

// Database tests: the verbose TAP log from scripts/db/test.sh (TAP_LOG). Known issues are
// "not ok ... # TODO": they are listed but do not fail the check.
let dbTotal = 0, dbFailed = 0;
const dbFailures = [], dbKnown = [];
const tap = process.argv[3];
if (tap && existsSync(tap)) {
  let file = '';
  for (const line of readFileSync(tap, 'utf8').split('\n')) {
    const f = /^(\S+\.test\.sql) \.\./.exec(line);
    if (f) { file = f[1].split('/').pop(); continue; }
    const t = /^(not )?ok \d+ - (.*?)(?: # (TODO|SKIP)\b ?(.*))?$/.exec(line);
    if (!t) continue;
    dbTotal++;
    if (t[3] === 'TODO') { if (t[1]) dbKnown.push(`- **${file}**: ${t[2]} (${t[4] || 'known issue'})`); continue; }
    if (t[1]) { dbFailed++; dbFailures.push(`- **${file}**: ${t[2]}`); }
  }
}

const ok = checks.every(([, o]) => o === 'success');
const out = [
  `## Release checks: ${ok ? 'PASSED' : 'FAILED'}`,
  '',
  ok ? 'All required checks passed. This change may be merged and released.'
     : 'At least one required check failed. Fix it before merging (or, for an emergency, an admin may merge with the `release-exception` label and a written reason).',
  '',
  '| Check | Result |',
  '| --- | --- |',
  ...checks.map(([n, o]) => `| ${n} | ${icon(o)} |`),
  '',
];
if (total) {
  out.push(`**Tests:** ${total} ran, ${total - failed - skipped} passed, ${failed} failed, ${skipped} skipped.`, '');
}
if (failures.length) out.push('### Failing tests', '', ...failures, '');
if (dbTotal) out.push(`**Database tests:** ${dbTotal} ran, ${dbTotal - dbFailed - dbKnown.length} passed, ${dbFailed} failed, ${dbKnown.length} known issues.`, '');
if (dbFailures.length) out.push('### Failing database tests', '', ...dbFailures, '');
if (dbKnown.length) out.push('### Known issues (tests marked TODO; not blocking)', '', ...dbKnown, '');
process.stdout.write(out.join('\n') + '\n');
