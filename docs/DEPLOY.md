# COM's Circuit Lab 배포

정적 앱은 `https://coms.kw.ac.kr/lab/`, 컴파일 API는 같은 origin의 `/lab/api/`에서 제공한다. API 계약은 `src/core/types.ts`의 `CompileResult` / `CompilerMessage`다. Node 패키지 의존성은 없다. 실제 Docker 빌드·Arduino 컴파일·호스트 nginx/방화벽 검증은 배포 담당자가 수행한다.

## 1. 버전과 이미지

| 구성 요소 | 고정 버전 | 근거 |
|---|---|---|
| Node | 22 계열 (`node:22-bookworm-slim`) | 보안 패치를 받는 태그. 배포 시 이미지 digest도 기록할 것 |
| Arduino CLI | 1.5.1 | [공식 릴리스 및 SHA-256](https://github.com/arduino/arduino-cli/releases/tag/v1.5.1) |
| Arduino AVR Boards | 1.8.8 | [공식 패키지 인덱스](https://downloads.arduino.cc/packages/package_index.json) |
| Servo | 1.2.2 | [버전 메타데이터](https://github.com/arduino-libraries/Servo/blob/1.2.2/library.properties) |
| LiquidCrystal I2C | 1.1.2, Frank de Brabander | [저자·버전 메타데이터](https://github.com/johnrickman/LiquidCrystal_I2C/blob/1.1.2/library.properties) |
| DHT sensor library | 1.4.6 | [버전·의존성 메타데이터](https://github.com/adafruit/DHT-sensor-library/blob/1.4.6/library.properties) |
| Adafruit Unified Sensor | 1.1.15 | [버전 메타데이터](https://github.com/adafruit/Adafruit_Sensor/blob/1.1.15/library.properties) |
| Adafruit NeoPixel | 1.12.5 | [버전 메타데이터](https://github.com/adafruit/Adafruit_NeoPixel/blob/1.12.5/library.properties) |

Dockerfile은 amd64 / arm64 CLI 바이너리의 **리터럴 SHA-256**을 검사한다. AVR 코어와 라이브러리는 빌드 시 설치하고, `--no-deps`로 DHT의 의존성이 임의로 최신 버전으로 바뀌지 않게 한다. 설치 인덱스와 패키지는 Arduino CLI가 검증한다. 다운로드용 curl 등은 builder에만 있고 최종 이미지에는 Node, Arduino 도구, 필요한 공유 라이브러리와 CA 인증서만 남긴다. 소켓 공유 디렉터리 외의 호스트 디렉터리·Docker 소켓·시크릿을 마운트하지 않는다.

```sh
# 저장소 루트에서. Node 22로도 반드시 검증한다.
node --test compiler/test/
npm --prefix compiler test
docker build --pull --platform linux/amd64 -t coms-circuit-lab-compiler:release compiler/
NGINX_GID=$(getent group www-data | cut -d: -f3)  # 실제 nginx 그룹에 맞게 변경
export NGINX_GID
sudo install -d -o 10001 -g "$NGINX_GID" -m 2770 /run/coms-lab
docker compose -f compiler/docker-compose.yml up --build -d
curl --fail -b "$LAB_COOKIE_FILE" https://coms.kw.ac.kr/lab/api/health
```

프로덕션 Compose는 네트워크가 없으며 Unix 소켓만 사용한다. `compiler/docker-compose.dev.yml`은 로컬 개발 전용이며 일반 bridge에서 127.0.0.1:8787만 공개하고 `RATE_LIMIT_PER_MIN=120`을 사용한다. 개발용 실행: `docker compose -f compiler/docker-compose.dev.yml up --build -d`. 프로덕션은 non-root uid 10001, read-only root, 256 MiB `/tmp` tmpfs (`noexec,nosuid,nodev`), 모든 capability 제거, no-new-privileges, RAM 768 MiB(추가 swap 없음), CPU 1개, PID 128개를 적용한다. `init: true`로 고아 프로세스를 수거한다. 코어·라이브러리는 `/opt/arduino`에 읽기 전용으로 설치하고 캐시와 작업 파일은 `/tmp`만 사용한다.

## 2. 정적 파일 전송

`../coms-worldcup/.github/workflows/deploy.yml`과 동일하게 `dist/`의 **내용**을 전송한다. Node 22에서 install → test → build 순서다. 이 문서는 workflow 자체를 추가하지 않는다.

```sh
npm ci
npm test
npm run build
# CI에서는 기존 SSH_HOST/SSH_USER/SSH_PORT/SSH_KEY 보관·주입 방식을 사용한다.
# 아래 변수는 실제 배포 대상과 이미 검증된 known_hosts/키를 가리켜야 한다.
DEPLOY_HOST=coms.kw.ac.kr
DEPLOY_USER=kw
DEPLOY_PORT=22
ssh -i ~/.ssh/deploy_key -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" \
  'mkdir -p /var/www/coms-circuit-lab'
rsync -avz --delete -e "ssh -i ~/.ssh/deploy_key -p $DEPLOY_PORT" \
  dist/ "$DEPLOY_USER@$DEPLOY_HOST":/var/www/coms-circuit-lab/
```

`--delete`는 목적지의 불필요한 파일을 삭제한다. 목적지가 `/var/www/coms-circuit-lab/`인지 확인하고 기존 배포본은 별도 보관한다. Vite `base`는 `/lab/`이어야 한다.

## 3. 호스트 nginx

`limit_req_zone`은 기존 nginx의 **http 블록**에 한 번만 추가한다. 아래 location들은 `coms.kw.ac.kr` HTTPS server 블록 안에 넣는다. 기존 `/api/`, 로그인, 다른 서비스 설정을 대체하지 않는다.

```nginx
# http {}
limit_req_zone $binary_remote_addr zone=lab_compile:10m rate=10r/m;

# 기존 HTTPS server {} 안
location = /lab { return 301 /lab/; }

location ^~ /lab/api/ {
    auth_request /lab/_auth;
    proxy_pass http://unix:/run/coms-lab/compile.sock:/lab/api/;
    # nginx 공식 Unix 소켓 문법. location의 /lab/api/를 같은 URI로 치환해 경로 보존.
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Cookie "";
    # 클라이언트가 보낸 XFF를 덧붙이지 않고 덮어쓴다.
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    client_max_body_size 100k;
    client_body_timeout 10s;
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
    proxy_request_buffering on;
    proxy_buffering off;
    limit_req zone=lab_compile burst=10 nodelay;
    limit_req_status 429;
    error_page 429 = @lab_rate_limited;
}

# 실제 백엔드 포트/경로로 치환한다. /api/auth/me가 미인증에 401/403을 반환하는지 검증한다.
location = /lab/_auth {
    internal;
    proxy_pass http://127.0.0.1:BACKEND_PORT/api/auth/me;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
}

location @lab_rate_limited {
    default_type application/json;
    add_header Cache-Control no-store always;
    add_header Retry-After 60 always;
    return 429 '{"ok":false,"reason":"rate-limited","errors":[{"line":0,"severity":"error","message":"요청이 너무 많아요. 잠시 후 다시 시도해 주세요."}]}';
}

location /lab/ {
    alias /var/www/coms-circuit-lab/;
    try_files $uri $uri/ /lab/index.html;
}
```

```sh
sudo nginx -t
sudo systemctl reload nginx
curl --fail -b "$LAB_COOKIE_FILE" https://coms.kw.ac.kr/lab/api/health
curl --fail -I https://coms.kw.ac.kr/lab/
```

nginx보다 앱의 본문 제한(80 KiB)이 작다. nginx가 먼저 차단한 100 KiB 초과 요청 등은 nginx 자체 응답일 수 있다. 앱 자체는 잘못된 JSON·타입·크기를 HTTP 400 `reason: rejected`로 반환한다. API에 CORS 헤더를 추가하지 않는다. nginx 앞에 신뢰 프록시가 있다면 그 프록시에 한정한 `real_ip` 설정을 검증한 뒤 `$remote_addr`를 사용한다.

**대기시간 주의:** 2개 실행 + 6개 대기에서 작업마다 20초가 걸리면 마지막 요청은 약 80초가 필요하다. 위 요구 설정의 `proxy_read_timeout 30s`에서는 긴 대기 요청이 먼저 504가 될 수 있다. 클라이언트는 즉시 무한 재시도하지 않아야 한다. 모든 대기 요청의 완료 응답을 보장해야 하는 운영 정책이라면 nginx와 클라이언트 제한을 함께 95초 이상으로 조정한다. 끊긴 연결의 대기 작업은 실행 시 건너뛰지만 이미 실행 중인 컴파일은 최대 20초 안에 종료한다.

## 4. 프로덕션 컨테이너와 외부 통신 차단

프로덕션은 `network_mode: none`과 Unix 소켓으로 동작한다. 호스트 nginx가 `/run/coms-lab/compile.sock`으로 접속하므로 Docker 포트 공개나 bridge가 없다. [nginx `proxy_pass` 공식 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)는 `http://unix:/path/socket:/uri/` 문법과 location URI 치환을 명시한다.

```sh
# 실제 nginx 실행 그룹의 숫자 GID로 대체한다. www-data는 Debian 예시다.
NGINX_GID=$(getent group www-data | cut -d: -f3)
sudo install -d -o 10001 -g "$NGINX_GID" -m 2770 /run/coms-lab
# uid 10001이 소켓을 만들고, 지정 GID를 가진 nginx가 0660 소켓을 읽는다.
docker run -d --name coms-circuit-lab-compiler \
  --restart unless-stopped --init --stop-timeout 25 \
  --network none --user "10001:$NGINX_GID" \
  --mount type=bind,src=/run/coms-lab,dst=/run/coms-lab \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 768m --memory-swap 768m --cpus 1.0 --pids-limit 128 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --env LISTEN_SOCKET=/run/coms-lab/compile.sock \
  --env TRUST_PROXY=1 \
  coms-circuit-lab-compiler:release
stat -c '%a %u %g %n' /run/coms-lab/compile.sock # 660 10001 <NGINX_GID>
```

`/run`은 재부팅 시 지워질 수 있으므로 systemd-tmpfiles 등으로 디렉터리를 다시 생성해야 한다. nginx 서비스가 실제로 해당 GID로 실행되는지 확인하고, GID 0 및 `/etc/shadow`의 그룹 GID를 사용하지 않는다. 소켓 소유권은 `--user`의 UID:GID와 0117 umask로 정해진다. 이미지의 기본 사용자는 비특권 UID 10001이며 `/etc/shadow`는 기본 파일 권한으로 읽을 수 없다. 이미 소켓 파일이 있으면 시작을 거부한다. 재시작 시 기존 컨테이너가 종료된 것을 확인하고 오래된 소켓만 삭제한다. `PORT`를 통한 TCP 수신은 개발용 대안이며 프로덕션에는 사용하지 않는다.

## 5. 선택적 동아리 로그인 확인

`AUTH_CHECK_URL`은 네트워크 접근이 필요하므로 `--network none` 프로덕션에서는 비활성화한다. 대신 nginx [`auth_request`](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html)가 컴파일과 health 요청 전에 기존 인증 백엔드의 `/api/auth/me`를 조회한다. 설정의 `BACKEND_PORT`는 실제 로컬 백엔드 포트로 교체하고 nginx가 `http_auth_request_module`을 포함하는지 `nginx -V`로 확인한다. 쿠키는 인증 서브요청에만 전달하며, 인증 API가 미인증에 401/403을 반환하는지 먼저 확인한다. nginx `auth_request`는 2xx를 허용하고 401/403을 거부한다. 인증 서브요청 실패 시 API 접근이 막히는지 배포 smoke에서 확인한다.

## 6. 요청 검증·실행 정책

- JSON 본문 80 KiB, 스케치 UTF-8 64 KiB 제한. JSON Content-Type만 허용하며 압축 본문은 거부한다.
- 허용 헤더: `Arduino.h`, `Wire.h`, `SPI.h`, `Servo.h`, `LiquidCrystal_I2C.h`, `DHT.h`, `Adafruit_Sensor.h`, `Adafruit_NeoPixel.h`, `EEPROM.h`, `math.h`, `string.h`, `stdlib.h`, `avr/pgmspace.h`.
- quoted/macro include, 절대·상대 경로, `..`, 역슬래시, 목록 밖의 슬래시 경로를 거부한다. 줄 연결을 처리한 다음 주석을 제거하고 각 줄을 검사한다.
- `__has_`로 시작하는 모든 식별자, `asm` 계열, `incbin`, `_Pragma`/`__pragma`, `##`, `%:`/`??=`/`??/`, `\\u`/`\\U` UCN, raw 문자열, 숫자 구분자와 접두 문자 리터럴을 거부한다. 전처리 지시문은 허용 헤더의 리터럴 `#include <name.h>`, `#define`, `#undef`, `#if`, `#ifdef`, `#ifndef`, `#elif`, `#else`, `#endif`, `#error`, `#warning`만 허용한다. `#pragma`의 모든 변형, `#line`, `#include_next`, `#import`, `#embed`, `#ident`, `#sccs`, `#assert`, 잘못된 null 지시문을 거부한다. 교육용 C++ 부분집합이며 조건부 컴파일로 비활성화된 코드도 검사한다.
- shell 없이 고정 argv로 `arduino-cli compile --fqbn arduino:avr:uno --jobs 1 --warnings all --build-path <tmp>/build --output-dir <tmp>/out sketch`를 실행한다.
- 요청별 임시 폴더, 20초 제한, detached 프로세스 그룹 전체 SIGKILL, `finally` 삭제. 생성 HEX를 실행하거나 보드에 업로드하지 않는다.
- 최대 2개 실행 + 6개 FIFO 대기, 초과 시 429 `busy`. IP별 고정 60초 창 기본 10회 (`RATE_LIMIT_PER_MIN`으로 양의 정수 설정), 초과 시 429 `rate-limited`. 상태는 프로세스 메모리에 있으므로 재시작 시 초기화되며 다중 replica에 공유되지 않는다.
- `TRUST_PROXY=1`일 때만 X-Forwarded-For 첫 주소를 신뢰한다. nginx는 이를 덮어쓰고 프로덕션은 TCP 포트를 열지 않는다.
- GCC 진단은 작업 폴더의 정확한 `sketch.ino`와 유효한 사용자 코드 줄·열에서만 추출한다. 다른 파일의 note·출력·인용은 버리고, linker 실패는 고정 메시지와 line 0으로 반환한다. 절대 경로·임시 폴더 이름을 지우고 진단 30개 × 메시지 800자, 프로세스 출력 256 KiB, HEX 192 KiB로 제한한다. HEX 체크섬을 확인하고 bootloader HEX는 반환하지 않는다. `sizeBytes`는 HEX의 데이터 바이트 합계다.
- 컴파일 문법 오류는 HTTP 200 / `ok:false, reason:compile`, 실행 시간 초과는 HTTP 504 / `reason:timeout`. health는 HTTP 서버 liveness만 증명하며 Arduino 설치·실제 컴파일 성공을 증명하지 않는다.

## 7. 버전 갱신

1. 공식 Arduino CLI 릴리스의 amd64/arm64 아카이브와 SHA-256을 확인하고 Dockerfile의 버전·URL·리터럴 checksum을 함께 수정한다. 다운로드 실패나 checksum 불일치를 우회하지 않는다.
2. 공식 package/library index에서 코어·라이브러리 버전을 확인한다. LiquidCrystal은 같은 이름의 다른 구현이 아닌 Frank de Brabander의 `LiquidCrystal I2C`인지 확인한다.
3. DHT와 Unified Sensor를 함께 명시적으로 고정한다. 임의의 `core upgrade`/`lib upgrade`를 런타임에 실행하지 않는다.
4. 아래 테스트와 보안 회귀, 네트워크가 차단된 cold/warm compile을 다시 검증한다. 배포한 이미지 digest와 이전 digest를 기록해 이미지 단위로 rollback한다.

```sh
docker build --no-cache --pull -t coms-circuit-lab-compiler:next compiler/
docker image inspect coms-circuit-lab-compiler:next --format '{{.Id}}'
# 각 요청의 격리 한도와 동일한 환경에서 Node 22 테스트. 자동 skip이 없는지 출력 확인.
docker run --rm --network none --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=bind,src="$PWD",dst=/workspace,readonly \
  --workdir /workspace/compiler node:22-bookworm-slim node --test test/
```

## 8. 배포 smoke checklist

아래 요청은 **호스트에서 nginx를 통해** 실행한다. 컨테이너 네트워크가 없으므로 컨테이너에서 외부 주소에 접속할 수 없다.

```sh
sudo nginx -t
test -n "$LAB_COOKIE_FILE" # 호스트의 유효 회원 세션 쿠키 파일 경로; 값은 로그에 출력하지 않는다.
curl --fail -b "$LAB_COOKIE_FILE" https://coms.kw.ac.kr/lab/api/health
curl -sS -b "$LAB_COOKIE_FILE" -H 'Content-Type: application/json' \
  --data '{"sketch":"void setup() {}\nvoid loop() {}"}' \
  https://coms.kw.ac.kr/lab/api/compile
curl -sS -b "$LAB_COOKIE_FILE" -H 'Content-Type: application/json' \
  --data '{"sketch":"#include <../../etc/passwd>\nvoid setup() {}\nvoid loop() {}"}' \
  https://coms.kw.ac.kr/lab/api/compile
stat -c '%a %u %g %n' /run/coms-lab/compile.sock
# 예상: 660, uid 10001, nginx GID
curl -sS -o /dev/null -w '%{http_code}\n' https://coms.kw.ac.kr/lab/api/health
# 예상: 유효 쿠키 없이 401 또는 403
```

- [ ] 이미지 빌드·checksum 및 Node 22 전체 테스트 성공.
- [ ] nginx를 통한 health와 실제 compile 성공. 반환 HEX와 한글 힌트 확인.
- [ ] 파일 탐색 우회 요청은 `reason: rejected`이고 외부 파일 내용이 응답에 없다.
- [ ] 소켓 디렉터리 2770, 소켓 0660, nginx 그룹 접근 가능. 재부팅 후 디렉터리 재생성됨.
- [ ] `docker inspect`에서 `NetworkMode=none`, 포트 바인딩 없음, 비특권 UID/GID, 읽기 전용 루트 및 리소스 제한 확인.
- [ ] 요청 제한, 동시성 제한, 시간 초과와 로그의 스케치·쿠키 비노출 확인.
