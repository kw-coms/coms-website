import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Contract of the study code runner's wiring: nginx.frontend.conf (/study/api/run), docker-compose.yml
// (coms-study-runner) and the deploy. The runner's own checks live in runner/test.
const nginx = readFileSync(new URL('../nginx.frontend.conf', import.meta.url), 'utf8')
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
const siteHeaders = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')

const block = (header) => {
  const start = nginx.indexOf(header)
  assert.ok(start >= 0, `nginx.frontend.conf should have ${header}`)
  return nginx.slice(start, nginx.indexOf('\n    }\n', start))
}

// Zones are the study's own (never shared with the Circuit Lab), per address plus a shared backstop.
assert.match(nginx, /^limit_req_zone \$binary_remote_addr zone=study_pre_ip:/m)
assert.match(nginx, /^limit_conn_zone \$binary_remote_addr zone=study_pre_ip_conn:/m)
assert.match(nginx, /^limit_req_zone \$study_global zone=study_pre:/m)
assert.match(nginx, /map \$host \$study_global \{\s*default study;/)
assert.doesNotMatch(nginx, /limit_(req|conn)_zone [^;]*(\$cookie_|\$http_)/, 'no limit key taken straight from a client header or cookie')

const run = block('location = /study/api/run {')
for (const part of [
  /\$request_method != POST\) \{ return 405/, /\$http_sec_fetch_site = cross-site\) \{ return 403 '\{"error":"rejected"/,
  /http_cookie ~ "\^\.\{4097,\}"\) \{ return 431/, /token=\[\^;\]\*;/,
  /limit_req zone=study_pre_ip burst=/, /limit_req zone=study_pre burst=/, /limit_conn study_pre_ip_conn /, /limit_conn study_pre_conn /,
  /auth_request \/lab\/_auth;/, /auth_request_set \$runner_client \$upstream_http_x_member_id;/,
  /proxy_set_header X-Runner-Client \$runner_client;/, /proxy_set_header Cookie "";/, /proxy_set_header Authorization "";/,
  /client_max_body_size 100k/, /proxy_read_timeout 58s/,
  /proxy_pass http:\/\/unix:\/run\/coms-study\/run\.sock:\/study\/api\/run;/,
  /security-headers-common\.conf/, /proxy_hide_header X-Content-Type-Options/,
]) assert.match(run, part)
assert.match(block('location @study_unauthorized {'), /return 401 .*"error":"unauthorized".*messageKo/)
assert.match(block('location @study_rate_limited {'), /return 429 .*"error":"rate-limited".*messageKo/)
for (const named of ['location @study_unauthorized {', 'location @study_rate_limited {', 'location ^~ /study/api/ {']) {
  assert.match(block(named), /security-headers-common\.conf/, `${named} sends the shared security headers (nosniff, HSTS)`)
}
// Anything else under /study/api/ (health included, which is only for the container's own healthcheck) is a JSON 404.
assert.match(block('location ^~ /study/api/ {'), /return 404 .*"error":"rejected"/)
assert.doesNotMatch(nginx, /location [=^~ ]*\/study\/api\/health/, 'the runner health endpoint is not exposed')
assert.ok(nginx.indexOf('location ^~ /study/api/ {') < nginx.indexOf('location / {'))

// The playground calls the API from the study pages: the site CSP allows same-origin connections.
assert.match(siteHeaders, /connect-src 'self'/)

// Compose: sidecar hardening, shared socket volume, explicit production names, no dependency either way.
const service = compose.slice(compose.indexOf('  coms-study-runner:'), compose.indexOf('  coms-frontend:'))
for (const part of [
  /network_mode: none/, /read_only: true/, /cap_drop: \[ALL\]/, /- SETUID/, /- SETGID/, /- KILL/, /- SYS_RESOURCE/,
  /no-new-privileges:true/, /seccomp=\.\/runner\/seccomp\.json/, /user: "0:101"/, /restart: unless-stopped/,
  /ipc: private/, /kernel\.shmmax: "4194304"/, /fs\.mqueue\.queues_max: "16"/, /nr_inodes=4096/,
  /LISTEN_SOCKET: \/run\/coms-study\/run\.sock/, /TRUST_PROXY: "1"/, /study-runner-socket:\/run\/coms-study$/m, /study-runner-state:\/var\/lib\/coms-study$/m,
  /mem_limit: 768m/, /memswap_limit: 768m/, /pids_limit: 256/,
]) assert.match(service, part)
assert.doesNotMatch(service, /depends_on/, 'the runner does not depend on the site')
assert.doesNotMatch(service, /^\s+ports:/m, 'no TCP exposure')
const frontend = compose.slice(compose.indexOf('  coms-frontend:'), compose.indexOf('\nvolumes:'))
assert.match(frontend, /study-runner-socket:\/run\/coms-study:ro/)
assert.doesNotMatch(frontend.slice(frontend.indexOf('depends_on:')), /coms-study-runner/, 'the site does not wait for the runner')
const volumes = compose.slice(compose.indexOf('\nvolumes:'))
assert.match(volumes, /name: \$\{RUNNER_SOCKET_VOLUME:-coms-study-runner-socket\}/)
assert.match(volumes, /name: \$\{RUNNER_STATE_VOLUME:-coms-study-runner-state\}/)
assert.match(volumes, /type: tmpfs/)

// Deploy: handled by the same warn-only sidecar steps as the Circuit Lab compiler.
assert.match(readFileSync(new URL('../scripts/deploy-sidecars.sh', import.meta.url), 'utf8'), /SIDECARS="\$\{SIDECARS:-coms-lab-compiler coms-study-runner\}"/)
assert.doesNotMatch(deploy, /up -d --remove-orphans[^\n]*coms-study-runner/, 'the site start never names the runner')

console.log('study runner nginx / compose / deploy contract passed')
