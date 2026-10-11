// Every VITE_* variable the frontend reads has to be handed to the Docker build explicitly.
//
// Vite inlines import.meta.env.VITE_* at build time. The production image used to get those
// values because `COPY . .` copied the server's .env into the build — along with every backend
// secret in it. .env is now excluded from the build context, so a variable that is read in the
// source but not declared as a build argument is silently empty in production (web push would
// just disappear). This test is what notices.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')

function sourceFiles(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : []
  })
}

const used = new Set()
for (const path of [...sourceFiles('src'), 'vite.config.js', 'index.html']) {
  for (const match of read(path).matchAll(/VITE_[A-Z0-9_]+/g)) used.add(match[0])
}
assert.ok(used.has('VITE_API_BASE_URL') && used.has('VITE_SENTRY_DSN'), 'the scan finds the variables known to be in use')

const dockerfile = read('Dockerfile.frontend')
const compose = read('docker-compose.yml')
const frontendService = compose.slice(compose.indexOf('coms-frontend:'))
const buildArgs = frontendService.slice(frontendService.indexOf('args:'), frontendService.indexOf('container_name:'))

for (const name of [...used].sort()) {
  assert.match(dockerfile, new RegExp(`^ARG ${name}=`, 'm'), `Dockerfile.frontend must declare ARG ${name}`)
  assert.match(dockerfile, new RegExp(`^ENV ${name}=\\$${name}$`, 'm'), `Dockerfile.frontend must export ${name} to the build`)
  assert.match(buildArgs, new RegExp(`^\\s+${name}: \\$\\{${name}:-`, 'm'), `docker-compose.yml must pass ${name} as a frontend build argument`)
}

// The build stage must come after the declarations, or the values are not in the environment yet.
assert.ok(dockerfile.indexOf('RUN npm run build') > dockerfile.lastIndexOf('ENV VITE_'), 'ENV lines precede the build')

// …and the file with the backend secrets stays out of the image build context.
const ignored = read('.dockerignore').split(/\r?\n/).map((line) => line.trim())
assert.ok(ignored.includes('.env'), '.dockerignore must exclude .env')
assert.ok(ignored.includes('.env.*'), '.dockerignore must exclude .env.*')

console.log('frontend build env contract passed')
