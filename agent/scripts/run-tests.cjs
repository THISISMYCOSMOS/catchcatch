const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function collectSpecFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSpecFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.spec.ts')
      ? [resolve(entryPath)]
      : [];
  });
}

const specFiles = collectSpecFiles(resolve('src')).sort();
if (specFiles.length === 0) {
  throw new Error('No Jest spec files found under src');
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve('jest/bin/jest'),
    ...process.argv.slice(2),
    '--runTestsByPath',
    ...specFiles,
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
