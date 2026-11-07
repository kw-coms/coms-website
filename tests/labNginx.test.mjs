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
assert.match(nginx, /^limit_req_zone \$lab_client zone=lab_compile:/m)
assert.match(nginx, /^limit_conn_zone \$lab_client zone=lab_compile_conn:/m)
// Limits key on the session cookie, never on an address the host proxy may or may not forward truthfully.
assert.doesNotMatch(nginx, /^\s*(set_real_ip_from|real_ip_header)\b/m, 'no trust in a client address that the host config would have to supply')
assert.match(nginx, /map \$cookie_token \$lab_client \{/)
assert.doesNotMatch(nginx, /limit_(req|conn)_zone \$(binary_)?remote_addr[^\n]*lab_/)
const compile = block('location = /lab/api/compile {')
for (const part of [/!= POST\) \{ return 405/, /auth_request \/lab\/_auth/, /limit_req zone=lab_compile/, /limit_conn lab_compile_conn/, /client_max_body_size 100k/,
  /proxy_set_header Cookie ""/, /proxy_set_header X-Lab-Client \$lab_client;/, /proxy_set_header X-Forwarded-For ""/, /limit_req zone=lab_anon/, /proxy_pass http:\/\/unix:\/run\/coms-lab\/compile\.sock:\/lab\/api\/compile;/, /proxy_read_timeout 30s/]) {
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
for (const part of [/network_mode: none/, /read_only: true/, /cap_drop: \[ALL\]/, /no-new-privileges:true/, /user: "10001:101"/, /LISTEN_SOCKET: \/run\/coms-lab\/compile\.sock/, /lab-sock:\/run\/coms-lab/]) {
  assert.match(service, part)
}
const frontend = compose.slice(compose.indexOf('  coms-frontend:'), compose.indexOf('\nvolumes:'))
assert.match(frontend, /lab-sock:\/run\/coms-lab/)
assert.doesNotMatch(frontend.slice(frontend.indexOf('depends_on:')), /coms-lab-compiler/, 'coms-frontend must not depend on the compiler: the site stays up without it')

// Image: the Lab is built in its own stage, and the service worker leaves /lab/ alone.
assert.match(dockerfile, /COPY --from=lab-build \/lab\/dist \/usr\/share\/nginx\/html\/lab/)
assert.match(viteConfig, /\/\^\\\/lab\(\\\/\|\$\)\//, 'navigateFallbackDenylist must keep the SPA shell off /lab/')

// Deploy: the compiler can never fail or roll back the site. The site's services are started by name,
// the compiler goes through the warn-only helpers, and it is never in the rollback or health path.
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
assert.match(deploy, /up -d --remove-orphans db db-backup coms-backend coms-frontend/)
assert.doesNotMatch(deploy, /up -d --remove-orphans\s*$/m, 'a bare up -d would start the compiler and let its failure abort the deploy')
for (const step of ['lab_diagnostics', 'lab_snapshot_previous', 'lab_build', 'lab_rollback', 'lab_start', 'lab_finalize_tags']) {
  assert.match(deploy, new RegExp(`^\\s+${step}$`, 'm'), `deploy.yml must call ${step}`)
}
assert.ok(deploy.indexOf('lab_start') > deploy.indexOf('if ! site_is_healthy'), 'the compiler is replaced only after the site is healthy')
assert.doesNotMatch(deploy, /--no-build coms-backend coms-frontend coms-lab-compiler/)

console.log('lab nginx / compose contract passed')
