import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BASE = '068ad226f53e1ca62d857f78bdc32f58f3c5fce7';
const root = fileURLToPath(new URL('../', import.meta.url));
export const baselineSource = (name) => execFileSync('git', ['show', `${BASE}:lib/${name}`], { cwd: root, encoding: 'utf8' });
export const candidateSource = (name) => readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8');
export const headRevision = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
