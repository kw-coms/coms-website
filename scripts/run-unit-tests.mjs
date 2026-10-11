#!/usr/bin/env node
// Runs every tests/*.test.mjs in its own Node process, stopping at the first failure.
//
// The test list used to be spelled out file by file in package.json, so a new test that
// was not added there never ran (locally or in CI). Discovering the files removes that
// failure mode: dropping a *.test.mjs into tests/ is enough.
//
// Usage: node scripts/run-unit-tests.mjs [substring ...]   (filters by file name)

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const filters = process.argv.slice(2)

const files = readdirSync(resolve(repoRoot, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
  .sort()

if (files.length === 0) {
  console.error(filters.length ? `No unit tests match: ${filters.join(', ')}` : 'No unit tests found in tests/.')
  process.exit(1)
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `tests/${file}`], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`\nUnit test failed: tests/${file}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`\n${files.length} unit test files passed`)
