// Runs an n8n Code node's JavaScript (from /n8n/code) the way n8n does: as the body of a
// function that receives `$` (read another node's output) and `$now` (a Luxon DateTime), and
// returns an array of { json } items. Tests use this to check the exact code that runs live.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DateTime } from 'luxon';

export type Item = { json: Record<string, unknown> };

const CODE_DIR = resolve(__dirname, '../../../n8n/code');

export function loadNodeCode(file: string): string {
  return readFileSync(resolve(CODE_DIR, file), 'utf8');
}

/**
 * @param inputs  node name -> the items that node produced (`$('Node').all()` / `.item`)
 * @param now     the run time, ISO string; also the time `new Date()` returns inside the code
 * @param random  fixed value for Math.random() (0..1) so random gaps are repeatable
 */
export function runNode(
  code: string,
  inputs: Record<string, Record<string, unknown>[]>,
  opts: { now: string; random?: number },
): Item[] {
  const nowMs = Date.parse(opts.now);
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(nowMs);
      else super(...(args as [string]));
    }
    static now() { return nowMs; }
  }
  const math = Object.create(Math) as Math;
  math.random = () => opts.random ?? 0.5;
  const $ = (name: string) => {
    const rows = inputs[name];
    if (!rows) throw new Error(`Test gave no output for node "${name}"`);
    return { all: () => rows.map((json) => ({ json })), item: { json: rows[0] } };
  };
  const $now = DateTime.fromMillis(nowMs, { zone: 'UTC' });
  const fn = new Function('$', '$now', 'Date', 'Math', code) as (...a: unknown[]) => Item[];
  return fn($, $now, FixedDate, math);
}
