# COM's Circuit Lab 배포

Circuit Lab은 **동아리 사이트와 같은 저장소·같은 배포**로 나간다. 정적 앱은 `https://coms.kw.ac.kr/lab/`, 컴파일 API는 같은 origin의 `/lab/api/`다. API 계약은 `lab/src/core/types.ts`의 `CompileResult` / `CompilerMessage`다. `main`에 머지하면 CI 통과 후 기존 `deploy.yml`이 서버에서 `docker compose build` / `up -d`를 실행하며, Lab을 위한 별도 배포 단계는 없다. 앱 개발·테스트 방법은 [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md)의 "Circuit Lab 실행"에 있다.

## 0. 구성 한눈에 보기

```
브라우저 ──https──> 호스트 nginx ──/api/*──────────> coms-backend (127.0.0.1:8080)
                        └─ 그 외 (/lab/* 포함) ───> coms-frontend 컨테이너 (127.0.0.1:3000, nginx)
                                                      ├─ /lab/            정적 Lab (이미지 안 /usr/share/nginx/html/lab)
                                                      ├─ /lab/_auth       (내부) coms-backend /api/auth/me 로 로그인 확인
                                                      └─ /lab/api/compile ──unix 소켓──> coms-lab-compiler (network_mode none)
```

- **호스트 nginx는 바꾸지 않는다.** `/api`만 백엔드로 보내고 나머지는 프런트 컨테이너로 보내는 기존 설정에서 `/lab/*`도 이미 프런트 컨테이너에 도달한다.
- `Dockerfile.frontend`의 `lab-build` 단계가 `lab/`을 `npm ci && npm run build`(`tsc -b` 포함)로 빌드해 `/usr/share/nginx/html/lab/`에 복사한다. 사이트 본체 빌드와 의존성은 완전히 분리된다.
- `docker-compose.yml`의 `coms-lab-compiler` 서비스는 `lab/compiler`에서 빌드되고(이미지 태그는 `coms-lab-compiler:${COMS_IMAGE_TAG}`), `lab-sock` 볼륨의 Unix 소켓으로만 통신한다.
- **컴파일러는 배포를 실패시키거나 사이트를 롤백시킬 수 없다.** 배포 스크립트(`.github/workflows/deploy.yml`)는 사이트 서비스를 이름으로 올리고(`up -d --remove-orphans db db-backup coms-backend coms-frontend`), 컴파일러 단계는 `scripts/deploy-lab-compiler.sh`의 경고 전용 함수로만 실행한다: 서버 여유(`free -m`, `df -h /`) 출력 → 가용 메모리 1200 MB 미만이면 컴파일러 빌드·기동 생략 → 실행 중 이미지를 `coms-lab-compiler:previous`로 스냅샷(첫 배포는 없음) → 빌드 실패는 경고만 → **사이트 헬스 체크 통과 후에만** 새 컴파일러 기동(실패 시 previous로 복원) → 사이트 롤백 시 컴파일러는 아직 교체 전이므로 그대로(재생성 없음) → 새 컴파일러가 실제로 기동한 릴리스만 `latest`로 승격하고 live+previous만 남기고 정리(기동 실패 시 `latest`는 복원된 previous에 남는다). `scripts/test-deploy-lab-compiler.sh`가 임시 compose 프로젝트로 여러 릴리스(첫 배포, 롤백, 시작 실패, 빌드 실패, 저메모리)를 검증한다.
- **컴파일러가 죽어도 사이트는 산다.** `coms-frontend`는 컴파일러에 `depends_on` 하지 않는다. 컴파일러가 없으면 `/lab/api/compile`이 502를 반환하고 Lab은 "컴파일 서버에 연결할 수 없어요"를 보여 준다(회로 보기·시뮬레이션은 계속 동작). 배포 헬스 체크와 롤백(`--no-build coms-backend coms-frontend`)에도 컴파일러는 들어가지 않는다.

## 1. 버전과 이미지

| 구성 요소 | 고정 버전 | 근거 |
|---|---|---|
| Node | `node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d` | Dockerfile의 `NODE_IMAGE`에 고정된 digest |
| Arduino CLI | 1.5.1 | [공식 릴리스 및 SHA-256](https://github.com/arduino/arduino-cli/releases/tag/v1.5.1) |
| Arduino AVR Boards | 1.8.8 | [공식 패키지 인덱스](https://downloads.arduino.cc/packages/package_index.json) |
| Servo | 1.2.2 | [버전 메타데이터](https://github.com/arduino-libraries/Servo/blob/1.2.2/library.properties) |
| LiquidCrystal I2C | 1.1.2, Frank de Brabander | [저자·버전 메타데이터](https://github.com/johnrickman/LiquidCrystal_I2C/blob/1.1.2/library.properties) |
| DHT sensor library | 1.4.6 | [버전·의존성 메타데이터](https://github.com/adafruit/DHT-sensor-library/blob/1.4.6/library.properties) |
| Adafruit Unified Sensor | 1.1.15 | [버전 메타데이터](https://github.com/adafruit/Adafruit_Sensor/blob/1.1.15/library.properties) |
| Adafruit NeoPixel | 1.12.5 | [버전 메타데이터](https://github.com/adafruit/Adafruit_NeoPixel/blob/1.12.5/library.properties) |

Dockerfile은 amd64 / arm64 CLI 바이너리의 **리터럴 SHA-256**을 검사한다. AVR 코어와 라이브러리는 빌드 시 설치하고, `--no-deps`로 DHT의 의존성이 임의로 최신 버전으로 바뀌지 않게 한다. 설치 인덱스와 패키지는 Arduino CLI가 검증한다. 다운로드용 curl 등은 builder에만 있고 최종 이미지에는 Node, Arduino 도구, 필요한 공유 라이브러리와 리소스 제한용 `util-linux`만 남긴다. 최종 stage의 `ca-certificates` 설치는 제거했다. 오프라인 Arduino 도구는 인증서가 필요 없고, 선택적 Node HTTPS 인증은 Node 내장 CA를 사용한다. 소켓 공유 디렉터리 외의 호스트 디렉터리·Docker 소켓·시크릿을 마운트하지 않는다.

```sh

```sh
# 저장소 루트에서. Node 22로도 반드시 검증한다.
node --test lab/compiler/test/
docker build --pull --platform linux/amd64 -t coms-lab-compiler:release lab/compiler/
docker build -f Dockerfile.frontend -t coms-frontend:release .   # lab-build 단계 포함
```

Compose의 `coms-lab-compiler`는 `restart: unless-stopped`로 재시작하며 네트워크 없이 Unix 소켓만 사용한다. `lab/compiler/docker-compose.dev.yml`은 로컬 개발 전용이며 일반 bridge에서 127.0.0.1:8787만 공개하고 `RATE_LIMIT_PER_MIN=120`을 사용한다(`docker compose -f lab/compiler/docker-compose.dev.yml up --build -d`). 프로덕션은 non-root uid 10001, read-only root, 256 MiB `/tmp` tmpfs (`noexec,nosuid,nodev`), 모든 capability 제거, no-new-privileges, RAM 768 MiB(추가 swap 없음), CPU 1개, PID 128개를 적용한다. `init: true`로 고아 프로세스를 수거한다. 코어·라이브러리는 `/opt/arduino`에 읽기 전용으로 설치하고 캐시와 작업 파일은 `/tmp`만 사용한다.

## 2. 정적 파일

`Dockerfile.frontend`가 `lab/dist`를 이미지에 넣는다. Vite `base`는 `/lab/`이어야 한다(`lab/vite.config.ts`). 사이트의 서비스 워커(PWA)는 `/lab` 경로를 앱 셸로 가로채지 않도록 `vite.config.js`의 `navigateFallbackDenylist`에 등록돼 있다. 사이트 메뉴(Tools → Circuit Lab)는 라우터가 아니라 `window.location.assign('/lab/')`로 이동한다(`src/utils/fullPageLink.ts`).

## 3. 프런트 컨테이너의 nginx (`nginx.frontend.conf`)

| 경로 | 동작 |
|---|---|
| `/lab` | `/lab/`으로 301 (상대 `Location`, https 유지) |
| `/lab/index.html`, `/lab/` 그 외 | Lab CSP(`security-headers-lab.conf`), `Cache-Control: no-cache`. 없는 경로(`/lab/anything`)는 `/lab/index.html`로 fallback |
| `/lab/assets/*` | 해시 파일: `max-age=31536000, immutable`. 없으면 404 (앱 셸을 주지 않는다) |
| `POST /lab/api/compile` | 로그인 전 주소별 `limit_req` 분당 30회(burst 15)·`limit_conn` 6 + 공용 백스톱 분당 600회(burst 200)·`limit_conn` 64(회원별 분당 10회는 컴파일러), 중복 `token` 쿠키 400·과대 `Cookie` 431 → 429 JSON, `auth_request /lab/_auth` → 비로그인 401 JSON, 본문 100 KiB 제한, 소켓으로 프록시 (Cookie 제거, `X-Lab-Client`에 백엔드가 알려 준 회원 ID, XFF 제거, `proxy_read_timeout` 55초). 다른 메서드는 405 |
| `GET /lab/api/health` | 컴파일러 프로세스 liveness. 컴파일러가 없으면 502. 로그인 불필요 |
| 그 외 `/lab/api/*` | 404 |

- `limit_req_zone` / `limit_conn_zone`은 이 파일이 http 블록 안에 include되므로 파일 맨 위(server 밖)에 선언한다. 호스트 nginx는 건드리지 않는다.
- **한도는 두 겹이다.** (1) **로그인 전**: `limit_req`는 `auth_request`보다 먼저 실행되므로 이 층이 익명 트래픽과 백엔드 인증 서브요청 수를 묶는다. 클라이언트 주소별(분당 30회, burst 15, 동시 6개)과, 높은 백스톱인 라우트 전체 공용 한도(분당 600회, burst 200, 동시 64개; 인증 서브요청은 초당 10건 이하)를 함께 건다. 쿠키 `token`이 둘 이상이면 400, `Cookie` 헤더가 4096자를 넘으면 431로 인증 전에 거절한다. **클라이언트 주소는 호스트 nginx가 덮어쓰는 `X-Real-IP`에 의존한다.** 운영 호스트 `/etc/nginx/conf.d/coms.conf`의 catch-all location에 `proxy_set_header X-Real-IP $remote_addr;`가 있고(2026-11 서버에서 확인), 클라이언트가 보낸 값은 그대로 덮어써진다. 프런트 nginx는 Docker 기본 주소 풀(`set_real_ip_from 172.16.0.0/12`, 게시 포트는 127.0.0.1에만 바인딩)에서 온 요청의 `X-Real-IP`만 믿는다. 호스트의 그 줄이 사라지면 모든 방문자가 게이트웨이 주소 하나로 보여 주소별 한도(분당 30)를 나눠 쓰게 되지만, 공용 백스톱과 회원별 한도는 그대로여서 한도가 풀리는 방향으로는 무너지지 않는다. 대가: 공용 백스톱은 익명 트래픽과 회원이 함께 쓰므로, 그 한도를 넘는 폭주가 계속되는 동안은 회원의 컴파일도 429가 될 수 있다(실제 회원 트래픽은 1인당 분당 10회라 한참 아래다). (2) **로그인 후**: 백엔드 `GET /api/auth/me`가 인증된 본인의 학번을 `X-Member-Id` 응답 헤더로 돌려주고, nginx가 `auth_request_set $lab_member $upstream_http_x_member_id`로 받아 `X-Lab-Client: $lab_member`로 컴파일러에 전달한다(클라이언트가 보낸 값은 덮어쓴다). 컴파일러가 이 ID별로 분당 한도(`RATE_LIMIT_PER_MIN`, 기본 10)와 전역 실행/대기 큐(2+6)를 적용한다. 세션 토큰을 재발급해도 같은 회원은 같은 버킷이다.
- 헤더: `security-headers-common.conf`(사이트와 공통인 비-CSP 헤더) + 사이트용 CSP(`security-headers.conf`) 또는 Lab용 CSP(`security-headers-lab.conf`). `add_header`는 location에 하나라도 있으면 상속되지 않으므로 각 location이 둘 중 하나를 include한다.

## 4. 컴파일러 컨테이너와 외부 통신 차단

프로덕션은 `network_mode: none`과 Unix 소켓으로 동작한다. Docker 포트 공개나 bridge가 없다. [nginx `proxy_pass` 공식 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)는 `http://unix:/path/socket:/uri/` 문법과 location URI 치환을 명시한다.

- 이름 있는 볼륨 `lab-sock`을 컴파일러와 `coms-frontend`의 `/run/coms-lab`에 마운트한다(프런트는 `:ro`; Unix 소켓에 `connect`하려면 소켓 파일의 쓰기 권한이 필요하지만 읽기 전용 마운트여도 소켓 연결은 막히지 않는다 — 아래 smoke에서 확인).
- **seccomp**: `security_opt`가 `seccomp=./lab/compiler/seccomp.json`을 가리킨다. 운영 서버 엔진(Docker 29.9.0, 커널 7.0)과 같은 moby `docker-v29.9.0`의 공식 기본 프로파일(`vendor/github.com/moby/profiles/seccomp/default.json`)에서 무조건 허용되던 `ptrace`/`process_vm_readv`/`process_vm_writev`만 제거했고(CAP_SYS_PTRACE 조건부 항목은 우리가 모든 capability를 제거하므로 무효), 나머지는 그대로라 새 커널의 syscall(`statmount`, `listmount`, `mseal` 등)이 막히지 않는다. 엔진 기본값(Docker Desktop은 unconfined로 보고될 수 있음)에 의존하지 않도록 저장소에 고정하며, 엔진을 올릴 때 새 `default.json`과 비교한다. CI가 PID 1의 `Seccomp: 2`를 확인한다.
- 컴파일러는 `user: "10001:101"`로 실행한다. **101은 `nginx:alpine` 이미지의 `nginx` 그룹 GID**이고(`nginx:1.28-alpine`에서 `id nginx` = uid 101, gid 101), nginx worker가 이 그룹이다. 서버는 `umask 0117`로 소켓을 만들어 `0660 10001:101`이 된다.
- 새 볼륨은 처음 마운트될 때 이미지의 해당 디렉터리 소유자·모드를 복사한다. 두 이미지(`Dockerfile.frontend`, `lab/compiler/Dockerfile`)가 `/run/coms-lab`을 **같은 `10001:101`, 0750**으로 만들어 두므로 어느 컨테이너가 먼저 볼륨을 만들어도 같다. 0750이라 nginx 그룹은 디렉터리를 읽고 통과만 할 수 있고 소켓을 지우거나 바꿀 수 없다.
- 시작 시 기존 소켓에 연결해 `ECONNREFUSED`인 경우에만 inode를 재확인하고 삭제한다. 살아 있는 listener, 일반 파일·symlink, 권한 오류·연결 timeout은 거부한다. SIGKILL/OOM 이후 남은 소켓은 자동 복구된다. 같은 볼륨에 컴파일러 두 개를 동시에 띄우지 않는다. `PORT`를 통한 TCP 수신은 개발용 대안이며 프로덕션에는 사용하지 않는다.
- `TRUST_PROXY=1`: `X-Lab-Client`(nginx가 `/api/auth/me`의 `X-Member-Id`로 채움. 쿠키·토큰은 컴파일러에 전달되지 않는다)가 **필수**이며 컴파일러 자체의 회원별 한도 키다. 헤더가 없거나 형식(`[A-Za-z0-9_-]{1,64}`)이 다르면 로그인 검사를 통과하지 않은 요청으로 보고 401을 반환한다. `TRUST_PROXY` 없이(로컬 개발) 실행하면 소켓 주소를 키로 쓴다.
- `.env`에서 `LAB_RATE_LIMIT_PER_MIN`(기본 10)으로 컴파일러의 회원별 분당 한도를 바꿀 수 있다.

## 5. 로그인 확인

`AUTH_CHECK_URL`은 네트워크 접근이 필요하므로 `network_mode: none` 컴파일러에서는 비활성화한다. 대신 프런트 nginx의 [`auth_request`](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html)가 컴파일 요청 전에 내부 location `/lab/_auth`로 백엔드 `GET /api/auth/me`(Docker DNS의 `coms-backend:8080`)를 조회한다. 쿠키는 이 인증 서브요청에만 전달하고 컴파일러로는 보내지 않는다. 2xx면 통과, 401/403이면 다음 JSON을 401로 반환한다.

```json
{"ok":false,"errors":[{"line":0,"severity":"error","message":"로그인한 동아리원만 컴파일할 수 있어요."}]}
```

백엔드가 내려가 있으면 인증 서브요청이 실패해 컴파일은 500을 반환한다(Lab은 연결 오류 문구를 보인다). 액세스 토큰이 만료돼 401이 오면 Lab이 사이트의 `POST /api/auth/refresh`를 한 번 호출해 다시 시도하고(`lab/src/ui/compileClient.ts`), 그래도 401이면 "로그인한 동아리원만 컴파일할 수 있어요."와 `/login?returnTo=/lab/` 링크를 보여 준다(사이트 로그인은 `returnTo=/lab/`로 되돌려 보낸다). `/lab/api/*`에는 refresh 쿠키가 가지 않는다(경로 `/api/auth/refresh`).

## 6. 요청 검증·실행 정책

- JSON 본문 80 KiB, 스케치 UTF-8 64 KiB 제한. JSON Content-Type만 허용하며 압축 본문은 거부한다.
- 허용 헤더: `Arduino.h`, `Wire.h`, `SPI.h`, `Servo.h`, `LiquidCrystal_I2C.h`, `DHT.h`, `Adafruit_Sensor.h`, `Adafruit_NeoPixel.h`, `EEPROM.h`, `math.h`, `string.h`, `stdlib.h`, `avr/pgmspace.h`.
- quoted/macro include, 절대·상대 경로, `..`, 역슬래시, 목록 밖의 슬래시 경로를 거부한다. 줄 연결을 처리한 다음 주석을 제거하고 각 줄을 검사한다.
- `__has_`로 시작하는 모든 식별자, `asm` 계열, `incbin`, `_Pragma`/`__pragma`, `##`, `%:`/`??=`/`??/`, `\\u`/`\\U` UCN, raw 문자열, 숫자 구분자와 접두 문자 리터럴을 거부한다. 전처리 지시문은 허용 헤더의 리터럴 `#include <name.h>`, `#define`, `#undef`, `#if`, `#ifdef`, `#ifndef`, `#elif`, `#else`, `#endif`, `#error`, `#warning`만 허용한다. `#pragma`의 모든 변형, `#line`, `#include_next`, `#import`, `#embed`, `#ident`, `#sccs`, `#assert`, 잘못된 null 지시문을 거부한다. 교육용 C++ 부분집합이며 조건부 컴파일로 비활성화된 코드도 검사한다.
- shell 해석 없이 고정 argv로 `prlimit -- ... arduino-cli compile --fqbn arduino:avr:uno --jobs 1 --warnings all --build-property compiler.path=/opt/avr-limited/bin/ --build-path <tmp>/build --output-dir <tmp>/out sketch`를 실행한다. AVR wrapper는 도구 이름을 allowlist하고 원본 바이너리를 `exec`한다. 서버 환경은 상속하지 않는다: 고정 PATH, 요청별 HOME, `LANG=C`, 고정 Arduino DATA/USER 경로, 요청별 DOWNLOADS/CACHE, updater 비활성화만 자식에 전달한다.
- 요청별 임시 폴더, 20초 제한, detached 프로세스 그룹 전체 SIGKILL, `finally` 삭제. 생성 HEX를 실행하거나 보드에 업로드하지 않는다.
- 최대 2개 실행 + 6개 FIFO 대기, 초과 시 429 `busy`. 클라이언트(프로덕션: 회원 ID)별 고정 60초 창 기본 10회 (`RATE_LIMIT_PER_MIN`으로 양의 정수 설정), 초과 시 429 `rate-limited`. 요청 경로는 O(1) Map 조회/갱신이며 unref 타이머가 만료 항목을 정리한다. IPv6는 /64로 묶고 `::ffff:` IPv4 매핑은 IPv4로 정규화한다. 10,000 IP가 차도 만료 전 항목은 내보내지 않으며, 새 IP는 공유 overflow 버킷(같은 분당 한도) 하나로 합산 제한한다(IP 회전으로 카운터를 초기화할 수 없음). nginx 제한도 유지한다. 상태는 프로세스 메모리에 있으므로 재시작 시 초기화되며 다중 replica에 공유되지 않는다.
- `TRUST_PROXY=1`이면 `X-Lab-Client`(회원 ID)가 유일한 클라이언트 키이고 없으면 401이다. 프로덕션은 TCP 포트를 열지 않는다.
- GCC 진단은 작업 폴더의 정확한 `sketch.ino`와 유효한 사용자 코드 줄·열에서만 추출한다. 다른 파일의 note·출력·인용은 버리고, linker 실패는 고정 메시지와 line 0으로 반환한다. 절대 경로·임시 폴더 이름을 지우고 진단 30개 × 메시지 800자, 프로세스 출력 256 KiB, HEX 192 KiB로 제한한다. HEX 체크섬을 확인하고 bootloader HEX는 반환하지 않는다. `sizeBytes`는 HEX의 데이터 바이트 합계다.
- 컴파일 문법 오류는 HTTP 200 / `ok:false, reason:compile`, 실행 시간 초과는 HTTP 504 / `reason:timeout`. health는 HTTP 서버 liveness만 증명하며 Arduino 설치·실제 컴파일 성공을 증명하지 않는다.

> **요청 시간 상한.** 호스트 nginx의 catch-all location에는 `proxy_read_timeout`이 없어 기본 60초다. 그래서 컴파일러는 대기열에서 슬롯을 25초 안에 못 받은 요청을 429 `busy`로 돌려보내고(`createCompileQueue`의 `maxWaitMs`), 컴파일 자체는 20초로 끊는다. 합쳐도 약 46초 이내이고, 프런트 nginx의 `proxy_read_timeout`은 55초라 방문자는 항상 호스트의 504가 아니라 컴파일러의 JSON 응답을 받는다.

## 6a. 자식 한도와 실측 게이트

| 대상 | 주소 공간 (soft = hard) | CPU 시간 / 프로세스 | 단일 파일 크기 |
|---|---:|---:|---:|
| Arduino CLI 및 일반 자식 | 2 GiB (2147483648 B) | 15초 | 16 MiB (16777216 B) |
| AVR gcc/g++/ar/objcopy/size 및 그 자식 | 128 MiB (134217728 B) | 10초 | 16 MiB |

Core dump는 0 B다. `prlimit`이 없으면 제한 없이 실행하지 않고 실패한다. Go 기반 CLI는 가상 메모리 예약이 커 GCC와 같은 주소 공간 제한을 적용하지 않는다. GCC wrapper의 한도는 cc1plus, assembler, linker/LTO에 상속된다. CPU 한도는 프로세스별이며 전체 작업 합산이 아니다. 별도로 기존 **20초 wall-clock 프로세스 그룹 SIGKILL**과 모든 종료 경로의 요청 디렉터리 `finally` 삭제를 유지한다. [Linux rlimit 문서](https://man7.org/linux/man-pages/man2/prlimit.2.html)처럼 주소 공간은 RSS와 다르고 파일 한도는 디렉터리 총량이 아니다.

**운영 한도 재검증 필요:** 아래 실측은 컴파일 성공과 관찰된 자원 사용량을 보여주지만 1 GiB tmpfs와 CPU/RAM 제한 없는 컨테이너에서 수행됐다. 운영 설정인 `/tmp` 256 MiB, 메모리 768 MiB, CPU 1개에서의 성공·OOM 격리는 아직 확인되지 않았다. `/tmp`는 우선 기존 **256 MiB**, 컨테이너는 **768 MiB**를 유지한다. 임시 용량 예산은 동시 2건 × 96 MiB + 64 MiB 여유로 잡되, 이는 요청별 디스크 quota가 아니다. 운영 동등 조건에서 1/2건 peak와 성공 여부를 재확인한다. 초과 시 tmpfs와 컨테이너 RAM 예산을 함께 재산정해야 하며 tmpfs만 늘리지 않는다. 파일 크기 제한은 tmpfs 총량 제한을 대체하지 않는다.

```sh
# Dockerfile에는 Node 이미지 digest가 이미 고정돼 있다.
docker build --pull -t coms-circuit-lab-compiler:release lab/compiler/

# production과 같은 1 CPU / RAM / tmpfs / 사용자 권한. 5-library cold build 1건, 동시 2건.
# probe와 fixture는 이미지에 넣지 않고 read-only bind mount한다.
for jobs in 1 2; do
  docker run --rm --init --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777 \
    --memory 768m --memory-swap 768m --cpus 1.0 --pids-limit 128 \
    --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
    --mount type=bind,src="$PWD/lab/compiler",dst=/workspace,readonly \
    --workdir /workspace coms-lab-compiler:release node measure.mjs "$jobs"
done
```

`measure.mjs`는 20 ms 간격으로 작업 프로세스 그룹 RSS/VM, 요청 디렉터리의 할당 디스크 바이트와 최대 파일 크기를 기록하고 실제 컴파일 성공 여부를 JSON으로 출력한다. sampling은 짧은 peak를 놓칠 수 있으므로 여유를 남긴다. 위 운영 동등 명령으로 cold build 1/2건의 성공, 20초 이내 완료, VM/파일/디스크 여유를 재확인한 뒤 한도를 확정한다. 각 요청의 HOME과 CLI 캐시도 요청 디렉터리 아래에 있어 종료 시 같이 지워진다. 배포 담당자는 template/macro/대형 출력 공격과 정상 컴파일을 동시에 실행해 정상 요청 및 서버 생존, cgroup `memory.events`의 `oom_kill` 미증가, 작업 후 디렉터리 삭제까지 확인한다.

## 7. 버전 갱신

1. 공식 Arduino CLI 릴리스의 amd64/arm64 아카이브와 SHA-256을 확인하고 Dockerfile의 버전·URL·리터럴 checksum을 함께 수정한다. 다운로드 실패나 checksum 불일치를 우회하지 않는다.
2. 공식 package/library index에서 코어·라이브러리 버전을 확인한다. LiquidCrystal은 같은 이름의 다른 구현이 아닌 Frank de Brabander의 `LiquidCrystal I2C`인지 확인한다.
3. DHT와 Unified Sensor를 함께 명시적으로 고정한다. 임의의 `core upgrade`/`lib upgrade`를 런타임에 실행하지 않는다.
4. 아래 테스트와 보안 회귀, 네트워크가 차단된 cold/warm compile을 다시 검증한다. 배포한 이미지 digest와 이전 digest를 기록해 이미지 단위로 rollback한다.

```sh
docker build --no-cache --pull -t coms-circuit-lab-compiler:next lab/compiler/
docker image inspect coms-circuit-lab-compiler:next --format '{{.Id}}'
# 각 요청의 격리 한도와 동일한 환경에서 Node 22 테스트. 자동 skip이 없는지 출력 확인.
docker run --rm --network none --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=bind,src="$PWD/lab",dst=/workspace,readonly \
  --workdir /workspace/compiler node:22-bookworm-slim node --test test/
```

## 8. 배포 smoke checklist

`main` 머지 후 호스트에서 확인한다. 컨테이너는 네트워크가 없으므로 컨테이너에서 외부로 나갈 수 없다.

```sh
docker compose ps coms-lab-compiler coms-frontend             # 둘 다 Up (healthy)
docker inspect coms-lab-compiler --format '{{.HostConfig.NetworkMode}} {{.Config.User}} {{.HostConfig.ReadonlyRootfs}}'  # none 10001:101 true
docker exec coms-frontend ls -ln /run/coms-lab                # srw-rw---- 10001 101 compile.sock
curl -fsS https://coms.kw.ac.kr/lab/api/health                # 200
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' --data '{"sketch":"void setup(){}\nvoid loop(){}"}' https://coms.kw.ac.kr/lab/api/compile   # 로그인 쿠키 없이: 401
# 로그인한 브라우저에서 https://coms.kw.ac.kr/lab/ 의 Blink 예제를 컴파일
```

- [ ] 고정된 base index digest로 이미지 빌드·checksum 및 Node 22 전체 테스트 성공.
- [ ] 운영과 동일한 제한에서 5-library 1/2건 재측정, 자식 한도·tmpfs/RAM 여유 및 공격 중 서버/다른 job 생존 확인.
- [ ] `/lab/api/health` 200, 로그인 후 실제 compile 성공. 반환 HEX와 한글 힌트 확인.
- [ ] 비로그인 compile은 401 JSON, 파일 탐색 우회 요청은 `reason: rejected`이고 외부 파일 내용이 응답에 없다.
- [ ] 소켓 `0660 10001:101`, 소켓 디렉터리 `0750`. 컴파일러를 `docker stop`하면 `/lab/api/compile`이 502이고 사이트 `/`는 계속 200.
- [ ] `docker inspect`에서 `NetworkMode=none`, 포트 바인딩 없음, 비특권 UID/GID, 읽기 전용 루트 및 리소스 제한 확인.
- [ ] 요청 제한(429), 동시성 제한, 시간 초과와 로그의 스케치·쿠키 비노출 확인.

CI(`.github/workflows/ci.yml`)의 "Production images build & boot" 잡이 같은 compose 파일로 스택을 올려 프런트 컨테이너를 통한 비로그인 401, 로그인 후 Blink 컴파일, health를 자동 확인한다.

## 실측 리소스 (2026-11-07, coms-lab-compiler:local, Apple Silicon Docker)

`lab/compiler/measure.mjs`를 이미지 안에서 실행해 라이브러리 5종(Wire, LiquidCrystal_I2C, Servo, DHT, Adafruit_NeoPixel)을 쓰는 스케치를 컴파일한 값입니다.

| 동시 작업 | 총 RSS | arduino-cli VM | /tmp 사용 | 걸린 시간 |
|---|---|---|---|---|
| 1 | 212 MB | 1.52 GB | 1.8 MB | 0.97 s |
| 2 | 433 MB | 1.52 GB | 3.5 MB | 1.06 s |

이 수치는 아래 **1 GiB tmpfs, CPU/RAM 제한 없음** 조건에서 관찰됐다. 운영의 768 MiB 메모리, 1 CPU, 256 MiB tmpfs와 동일한 조건을 검증한 결과는 아니다. 기존 측정 명령:

```sh
docker run --rm --user 10001:10001 --tmpfs /tmp:size=1g,exec -v "$PWD/lab/compiler:/m:ro" -w /m --entrypoint node coms-lab-compiler:local /m/measure.mjs 2
```

## Content-Security-Policy (`/lab/`)

`/lab/` 응답에는 `security-headers-lab.conf`의 아래 CSP가 붙는다(프런트 nginx의 `/lab/` location 전부). `lab/tools/e2e-prod.mjs`(`npm run e2e:prod`)가 이 헤더로 운영 빌드를 띄워 위반이 없는지, 워커가 뜨는지, Blink가 컴파일·실행되는지 확인한다.

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- `style-src 'unsafe-inline'`: CodeMirror가 `<style>` 요소를 주입하므로 필요하다.
- `img-src data:`: `index.html`의 인라인 파비콘 때문에 필요하다.
- 사이트(SPA)의 CSP는 `/lab/`에 적용되지 않는다. 사이트 CSP를 바꿀 때 Lab 파일을 같이 바꿀 필요는 없고, 공통 헤더(HSTS 등)는 `security-headers-common.conf`에서 한 번만 바꾼다.
