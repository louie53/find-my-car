import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const git = process.env.FMC_GIT_BINARY || 'git';
const command = (args) => execFileSync(git, args, { encoding: 'utf8' }).trim();
const files = command(['ls-files', '-z']).split('\0').filter(Boolean);
const manifest = {
  commit: command(['rev-parse', 'HEAD']),
  createdAtUTC: new Date().toISOString(),
  node: process.version,
  trackedFiles: files.map((file) => ({
    path: file,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  })),
};
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/review-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest.commit + ': ' + files.length + ' tracked file hashes recorded.');
