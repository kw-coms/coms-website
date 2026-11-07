import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nginx = readFileSync(new URL('../nginx.frontend.conf', import.meta.url), 'utf8')
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const dockerfile = readFileSync(new URL('../Dockerfile.frontend', import.meta.url), 'utf8')
const labHeaders = readFileSync(new URL('../security-headers-lab.conf', import.meta.url), 'utf8')
const siteHeaders = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')
const commonHeaders = readFileSync(new URL('../security-headers-common.conf', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

const block = (header) => {
  const start = nginx.indexOf(header)
  assert.ok(start >= 0, `nginx.frontend.conf should have ${header}`)
  return nginx.slice(start, nginx.indexOf('\n    }\n', start))
}

// The zones are http-level; the compile route is members-only, POST-only, limited and socket-bound.
// Pre-login limits are one shared bucket: nothing a client sends (cookies, headers, addresses) can multiply it.
assert.match(nginx, /^limit_req_zone \$lab_global zone=lab_pre:64k rate=600r\/m;/m)
assert.match(nginx, /^limit_conn_zone \$lab_global zone=lab_pre_conn:/m)
assert.match(nginx, /map \$host \$lab_global \{\s*default lab;/)
// The client address is trusted only from Docker's private ranges, as the host nginx overwrites X-Real-IP.
assert.match(nginx, /^\s*set_real_ip_from 172\.16\.0\.0\/12;/m)
assert.match(nginx, /^\s*real_ip_header X-Real-IP;/m)
assert.doesNotMatch(nginx, /set_real_ip_from (0\.0\.0\.0|::|\d+\.\d+\.\d+\.\d+\/(?:[0-9]|1[01])(?!\d))/, 'never trust a wide range')
assert.match(nginx, /^limit_req_zone \$binary_remote_addr zone=lab_pre_ip:10m rate=30r\/m;/m)
assert.match(nginx, /^limit_conn_zone \$binary_remote_addr zone=lab_pre_ip_conn:/m)
assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr;/, 'the host nginx line this relies on is quoted in the conf')
assert.doesNotMatch(nginx, /limit_(req|conn)_zone [^;]*(\$cookie_|\$http_)/, 'no limit key taken straight from a client header or cookie')
const compile = block('location = /lab/api/compile {')
for (const part of [/!= POST\) \{ return 405/, /auth_request \/lab\/_auth/, /client_max_body_size 100k/,
  /proxy_set_header Cookie ""/, /auth_request_set \$lab_member \$upstream_http_x_member_id;/, /proxy_set_header X-Lab-Client \$lab_member;/, /proxy_set_header X-Forwarded-For ""/, /limit_req zone=lab_pre_ip burst=15/, /limit_conn lab_pre_ip_conn 6/, /limit_req zone=lab_pre burst=200/, /limit_conn lab_pre_conn 64/, /http_cookie ~ "\^\.\{4097,\}"\) \{ return 431/, /token=\[\^;\]\*;/, /proxy_pass http:\/\/unix:\/run\/coms-lab\/compile\.sock:\/lab\/api\/compile;/, /proxy_read_timeout 55s/]) {
  assert.match(compile, part)
}
// The compiler never receives the cookie, and every answer nginx writes itself carries nosniff + HSTS.
assert.doesNotMatch(compile, /proxy_set_header Cookie \$/)
for (const part of ['location ^~ /lab/api/ {', 'location @lab_unauthorized {', 'location @lab_rate_limited {', 'location = /lab/api/compile {', 'location = /lab/api/health {']) {
  assert.match(block(part), /security-headers-common\.conf/, `${part} must send the shared security headers`)
}
assert.match(commonHeaders, /X-Content-Type-Options "nosniff"/)
assert.match(commonHeaders, /Strict-Transport-Security/)
assert.match(block('location = /lab/_auth {'), /^\s+internal;/m, 'the auth subrequest must not be reachable from outside')
assert.match(block('location ^~ /lab/api/ {'), /return 404/, 'unlisted /lab/api paths do not exist')

// Order does not matter between exact and ^~ locations, but the SPA fallback must stay last.
assert.ok(nginx.indexOf('location ^~ /lab/ {') < nginx.indexOf('location / {'))

// Lab CSP: own-origin only, plus the three documented exceptions. The site CSP never applies to /lab/.
assert.match(labHeaders, /default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'/)
assert.match(labHeaders, /frame-ancestors 'none'/)
assert.doesNotMatch(labHeaders, /https:/)
for (const header of [siteHeaders, labHeaders]) assert.match(header, /include \/etc\/nginx\/security-headers-common\.conf;/)
assert.doesNotMatch(commonHeaders, /Content-Security-Policy "/, 'the shared file must not carry a CSP: each user adds its own')
for (const location of ['location = /lab/index.html {', 'location ^~ /lab/assets/ {', 'location ^~ /lab/ {']) {
  assert.match(block(location), /security-headers-lab\.conf/)
  assert.doesNotMatch(block(location), /security-headers\.conf/)
}

// Compose: no network, read-only, shared socket volume, and the site must not wait for the compiler.
const service = compose.slice(compose.indexOf('  coms-lab-compiler:'), compose.indexOf('  coms-frontend:'))
assert.match(service, /seccomp=\.\/lab\/compiler\/seccomp\.json/, 'seccomp is pinned to the repository profile, not the engine default')
const seccomp = JSON.parse(readFileSync(new URL('../lab/compiler/seccomp.json', import.meta.url), 'utf8'))
assert.equal(seccomp.defaultAction, 'SCMP_ACT_ERRNO')
// Rules gated on a capability are inert: the compiler runs with cap_drop ALL.
const allowed = new Set(seccomp.syscalls.flatMap((rule) => (rule.action === 'SCMP_ACT_ALLOW' && !rule.includes?.caps ? rule.names : [])))
for (const name of ['ptrace', 'process_vm_readv', 'process_vm_writev', 'mount', 'bpf', 'keyctl']) assert.ok(!allowed.has(name), `${name} must not be allowed unconditionally`)
for (const name of ['read', 'write', 'execve', 'clone', 'prlimit64', 'wait4']) assert.ok(allowed.has(name), `${name} is needed by the compiler`)
for (const part of [/network_mode: none/, /read_only: true/, /cap_drop: \[ALL\]/, /no-new-privileges:true/, /user: "10001:101"/, /LISTEN_SOCKET: \/run\/coms-lab\/compile\.sock/, /lab-sock:\/run\/coms-lab/]) {
  assert.match(service, part)
}
const frontend = compose.slice(compose.indexOf('  coms-frontend:'), compose.indexOf('\nvolumes:'))
assert.match(frontend, /lab-sock:\/run\/coms-lab/)
assert.doesNotMatch(frontend.slice(frontend.indexOf('depends_on:')), /coms-lab-compiler/, 'coms-frontend must not depend on the compiler: the site stays up without it')

// Image: the Lab is built in its own stage, and the service worker leaves /lab/ alone.
assert.match(dockerfile, /COPY --from=lab-build \/lab\/dist \/usr\/share\/nginx\/html\/lab/)
assert.match(viteConfig, /\/\^\\\/lab\(\\\/\|\$\)\//, 'navigateFallbackDenylist must keep the SPA shell off /lab/')

// Deploy: the sidecars (compiler, study runner) can never fail or roll back the site. The site's services are started by name,
// the compiler goes through the warn-only helpers, and it is never in the rollback or health path.
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
assert.match(deploy, /up -d --remove-orphans db db-backup coms-backend coms-frontend/)
assert.doesNotMatch(deploy, /up -d --remove-orphans\s*$/m, 'a bare up -d would start the compiler and let its failure abort the deploy')
for (const step of ['sidecars_diagnostics', 'sidecars_snapshot', 'sidecars_build', 'sidecars_rollback', 'sidecars_start', 'sidecars_finalize_tags']) {
  assert.match(deploy, new RegExp(`^\\s+${step}$`, 'm'), `deploy.yml must call ${step}`)
}
assert.ok(deploy.indexOf('sidecars_start') > deploy.indexOf('if ! site_is_healthy'), 'the compiler is replaced only after the site is healthy')
assert.doesNotMatch(deploy, /--no-build coms-backend coms-frontend coms-lab-compiler/)

console.log('lab nginx / compose contract passed')
