# COM's Circuit Lab 배포

정적 앱은 `https://coms.kw.ac.kr/lab/`, 컴파일 API는 같은 origin의 `/lab/api/`에서 제공한다. API 계약은 `src/core/types.ts`의 `CompileResult` / `CompilerMessage`다. Node 패키지 의존성은 없다. 실제 Docker 빌드·Arduino 컴파일·호스트 nginx/방화벽 검증은 배포 담당자가 수행한다.

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
# 저장소 루트에서. Node 22로도 반드시 검증한다.
node --test compiler/test/
npm --prefix compiler test
docker build --pull --platform linux/amd64 -t coms-circuit-lab-compiler:release compiler/
NGINX_GID=$(getent group www-data | cut -d: -f3)  # 실제 nginx 그룹에 맞게 변경
export NGINX_GID
# 실제 nginx 그룹 이름으로 www-data를 교체하고, Compose 시작 전에 설치한다.
printf 'd /run/coms-lab 0750 10001 www-data -\n' | sudo tee /etc/tmpfiles.d/coms-lab.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/coms-lab.conf
docker compose -f compiler/docker-compose.yml up --build -d
curl --fail -b "$LAB_COOKIE_FILE" https://coms.kw.ac.kr/lab/api/health
```

프로덕션 Compose는 `restart: unless-stopped`로 재시작하며 네트워크 없이 Unix 소켓만 사용한다. `compiler/docker-compose.dev.yml`은 로컬 개발 전용이며 일반 bridge에서 127.0.0.1:8787만 공개하고 `RATE_LIMIT_PER_MIN=120`을 사용한다. 개발용 실행: `docker compose -f compiler/docker-compose.dev.yml up --build -d`. 프로덕션은 non-root uid 10001, read-only root, 256 MiB `/tmp` tmpfs (`noexec,nosuid,nodev`), 모든 capability 제거, no-new-privileges, RAM 768 MiB(추가 swap 없음), CPU 1개, PID 128개를 적용한다. `init: true`로 고아 프로세스를 수거한다. 코어·라이브러리는 `/opt/arduino`에 읽기 전용으로 설치하고 캐시와 작업 파일은 `/tmp`만 사용한다.

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

`limit_req_zone`과 `limit_conn_zone`은 기존 nginx의 **http 블록**에 한 번만 추가한다. 아래 location들은 `coms.kw.ac.kr` HTTPS server 블록 안에 넣는다. 기존 `/api/`, 로그인, 다른 서비스 설정을 대체하지 않는다.

```nginx
# http {}
limit_req_zone $binary_remote_addr zone=lab_compile:10m rate=10r/m;
limit_conn_zone $binary_remote_addr zone=lab_compile_conn:10m;

# 기존 HTTPS server {} 안
location = /lab { return 301 /lab/; }

location = /lab/api/compile {
    limit_except POST { deny all; }
    limit_conn lab_compile_conn 4;
    limit_conn_status 429;
    auth_request /lab/_auth;
    proxy_pass http://unix:/run/coms-lab/compile.sock:/lab/api/compile;
    # nginx 공식 Unix 소켓 문법. 정확한 compile URI를 보존한다.
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

# Health는 GET 유지. POST 전용 compile location과 분리한다.
location = /lab/api/health {
    limit_except GET { deny all; }
    auth_request /lab/_auth;
    proxy_pass http://unix:/run/coms-lab/compile.sock:/lab/api/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Cookie "";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    client_max_body_size 100k;
    client_body_timeout 10s;
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
    proxy_request_buffering on;
    proxy_buffering off;
}
location ^~ /lab/api/ { return 404; }

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
# 실제 nginx 그룹 이름으로 www-data를 교체한다. /run 재생성 때도 적용된다.
printf 'd /run/coms-lab 0750 10001 www-data -\n' | sudo tee /etc/tmpfiles.d/coms-lab.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/coms-lab.conf
stat -c '%a %u %g %n' /run/coms-lab # 750 10001 <NGINX_GID>
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

`/run`은 재부팅 시 지워질 수 있으므로 위 tmpfiles 설정을 **Compose 최초 시작 전** 설치한다. 부팅 시 `systemd-tmpfiles-setup.service`가 디렉터리를 재생성하는지 확인하고, Compose를 systemd unit으로 시작한다면 그 unit의 `ExecStartPre=/usr/bin/systemd-tmpfiles --create /etc/tmpfiles.d/coms-lab.conf`로 시작 순서를 보장한다. nginx 서비스가 실제로 해당 GID로 실행되는지 확인하고, GID 0 및 `/etc/shadow`의 그룹 GID를 사용하지 않는다. 소켓 소유권은 `--user`의 UID:GID와 0117 umask로 정해진다. 이미지의 기본 사용자는 비특권 UID 10001이며 `/etc/shadow`는 기본 파일 권한으로 읽을 수 없다. 소켓 디렉터리는 0750으로 nginx 그룹의 디렉터리 쓰기(삭제·교체)를 막는다. 소켓 자체는 0660이다. 시작 시 기존 소켓에 연결해 `ECONNREFUSED`인 경우에만 inode를 재확인하고 삭제한다. 살아 있는 listener, 일반 파일·symlink, 권한 오류·연결 timeout은 거부한다. SIGKILL/OOM 이후 남은 소켓은 자동 복구된다. 같은 디렉터리에 동시에 두 compiler 인스턴스를 시작하지 않는다(검사와 unlink는 원자적 연산이 아니다). `PORT`를 통한 TCP 수신은 개발용 대안이며 프로덕션에는 사용하지 않는다.

## 5. 선택적 동아리 로그인 확인

`AUTH_CHECK_URL`은 네트워크 접근이 필요하므로 `--network none` 프로덕션에서는 비활성화한다. 대신 nginx [`auth_request`](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html)가 컴파일과 health 요청 전에 기존 인증 백엔드의 `/api/auth/me`를 조회한다. 설정의 `BACKEND_PORT`는 실제 로컬 백엔드 포트로 교체하고 nginx가 `http_auth_request_module`을 포함하는지 `nginx -V`로 확인한다. 쿠키는 인증 서브요청에만 전달하며, 인증 API가 미인증에 401/403을 반환하는지 먼저 확인한다. nginx `auth_request`는 2xx를 허용하고 401/403을 거부한다. 인증 서브요청 실패 시 API 접근이 막히는지 배포 smoke에서 확인한다.

## 6. 요청 검증·실행 정책

- JSON 본문 80 KiB, 스케치 UTF-8 64 KiB 제한. JSON Content-Type만 허용하며 압축 본문은 거부한다.
- 허용 헤더: `Arduino.h`, `Wire.h`, `SPI.h`, `Servo.h`, `LiquidCrystal_I2C.h`, `DHT.h`, `Adafruit_Sensor.h`, `Adafruit_NeoPixel.h`, `EEPROM.h`, `math.h`, `string.h`, `stdlib.h`, `avr/pgmspace.h`.
- quoted/macro include, 절대·상대 경로, `..`, 역슬래시, 목록 밖의 슬래시 경로를 거부한다. 줄 연결을 처리한 다음 주석을 제거하고 각 줄을 검사한다.
- `__has_`로 시작하는 모든 식별자, `asm` 계열, `incbin`, `_Pragma`/`__pragma`, `##`, `%:`/`??=`/`??/`, `\\u`/`\\U` UCN, raw 문자열, 숫자 구분자와 접두 문자 리터럴을 거부한다. 전처리 지시문은 허용 헤더의 리터럴 `#include <name.h>`, `#define`, `#undef`, `#if`, `#ifdef`, `#ifndef`, `#elif`, `#else`, `#endif`, `#error`, `#warning`만 허용한다. `#pragma`의 모든 변형, `#line`, `#include_next`, `#import`, `#embed`, `#ident`, `#sccs`, `#assert`, 잘못된 null 지시문을 거부한다. 교육용 C++ 부분집합이며 조건부 컴파일로 비활성화된 코드도 검사한다.
- shell 해석 없이 고정 argv로 `prlimit -- ... arduino-cli compile --fqbn arduino:avr:uno --jobs 1 --warnings all --build-property compiler.path=/opt/avr-limited/bin/ --build-path <tmp>/build --output-dir <tmp>/out sketch`를 실행한다. AVR wrapper는 도구 이름을 allowlist하고 원본 바이너리를 `exec`한다. 서버 환경은 상속하지 않는다: 고정 PATH, 요청별 HOME, `LANG=C`, 고정 Arduino DATA/USER 경로, 요청별 DOWNLOADS/CACHE, updater 비활성화만 자식에 전달한다.
- 요청별 임시 폴더, 20초 제한, detached 프로세스 그룹 전체 SIGKILL, `finally` 삭제. 생성 HEX를 실행하거나 보드에 업로드하지 않는다.
- 최대 2개 실행 + 6개 FIFO 대기, 초과 시 429 `busy`. IP별 고정 60초 창 기본 10회 (`RATE_LIMIT_PER_MIN`으로 양의 정수 설정), 초과 시 429 `rate-limited`. 요청 경로는 O(1) Map 조회/갱신이며 unref 타이머가 만료 항목을 정리한다. IPv6는 /64로 묶고 `::ffff:` IPv4 매핑은 IPv4로 정규화한다. 10,000 IP가 차도 만료 전 항목은 내보내지 않으며, 새 IP는 공유 overflow 버킷(같은 분당 한도) 하나로 합산 제한한다(IP 회전으로 카운터를 초기화할 수 없음). nginx 제한도 유지한다. 상태는 프로세스 메모리에 있으므로 재시작 시 초기화되며 다중 replica에 공유되지 않는다.
- `TRUST_PROXY=1`일 때만 X-Forwarded-For의 가장 오른쪽 주소를 신뢰한다. nginx는 `$remote_addr`로 이를 덮어쓰고 프로덕션은 TCP 포트를 열지 않는다.
- GCC 진단은 작업 폴더의 정확한 `sketch.ino`와 유효한 사용자 코드 줄·열에서만 추출한다. 다른 파일의 note·출력·인용은 버리고, linker 실패는 고정 메시지와 line 0으로 반환한다. 절대 경로·임시 폴더 이름을 지우고 진단 30개 × 메시지 800자, 프로세스 출력 256 KiB, HEX 192 KiB로 제한한다. HEX 체크섬을 확인하고 bootloader HEX는 반환하지 않는다. `sizeBytes`는 HEX의 데이터 바이트 합계다.
- 컴파일 문법 오류는 HTTP 200 / `ok:false, reason:compile`, 실행 시간 초과는 HTTP 504 / `reason:timeout`. health는 HTTP 서버 liveness만 증명하며 Arduino 설치·실제 컴파일 성공을 증명하지 않는다.

## 6a. 자식 한도와 실측 게이트

| 대상 | 주소 공간 (soft = hard) | CPU 시간 / 프로세스 | 단일 파일 크기 |
|---|---:|---:|---:|
| Arduino CLI 및 일반 자식 | 2 GiB (2147483648 B) | 15초 | 16 MiB (16777216 B) |
| AVR gcc/g++/ar/objcopy/size 및 그 자식 | 128 MiB (134217728 B) | 10초 | 16 MiB |

Core dump는 0 B다. `prlimit`이 없으면 제한 없이 실행하지 않고 실패한다. Go 기반 CLI는 가상 메모리 예약이 커 GCC와 같은 주소 공간 제한을 적용하지 않는다. GCC wrapper의 한도는 cc1plus, assembler, linker/LTO에 상속된다. CPU 한도는 프로세스별이며 전체 작업 합산이 아니다. 별도로 기존 **20초 wall-clock 프로세스 그룹 SIGKILL**과 모든 종료 경로의 요청 디렉터리 `finally` 삭제를 유지한다. [Linux rlimit 문서](https://man7.org/linux/man-pages/man2/prlimit.2.html)처럼 주소 공간은 RSS와 다르고 파일 한도는 디렉터리 총량이 아니다.

**운영 한도 재검증 필요:** 아래 실측은 컴파일 성공과 관찰된 자원 사용량을 보여주지만 1 GiB tmpfs와 CPU/RAM 제한 없는 컨테이너에서 수행됐다. 운영 설정인 `/tmp` 256 MiB, 메모리 768 MiB, CPU 1개에서의 성공·OOM 격리는 아직 확인되지 않았다. `/tmp`는 우선 기존 **256 MiB**, 컨테이너는 **768 MiB**를 유지한다. 임시 용량 예산은 동시 2건 × 96 MiB + 64 MiB 여유로 잡되, 이는 요청별 디스크 quota가 아니다. 운영 동등 조건에서 1/2건 peak와 성공 여부를 재확인한다. 초과 시 tmpfs와 컨테이너 RAM 예산을 함께 재산정해야 하며 tmpfs만 늘리지 않는다. 파일 크기 제한은 tmpfs 총량 제한을 대체하지 않는다.

```sh
# Dockerfile에는 Node 이미지 digest가 이미 고정돼 있다.
docker build --pull -t coms-circuit-lab-compiler:release compiler/

# production과 같은 1 CPU / RAM / tmpfs / 사용자 권한. 5-library cold build 1건, 동시 2건.
# probe와 fixture는 이미지에 넣지 않고 read-only bind mount한다.
for jobs in 1 2; do
  docker run --rm --init --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777 \
    --memory 768m --memory-swap 768m --cpus 1.0 --pids-limit 128 \
    --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
    --mount type=bind,src="$PWD/compiler",dst=/workspace,readonly \
    --workdir /workspace coms-circuit-lab-compiler:release node measure.mjs "$jobs"
done
```

`measure.mjs`는 20 ms 간격으로 작업 프로세스 그룹 RSS/VM, 요청 디렉터리의 할당 디스크 바이트와 최대 파일 크기를 기록하고 실제 컴파일 성공 여부를 JSON으로 출력한다. sampling은 짧은 peak를 놓칠 수 있으므로 여유를 남긴다. 위 운영 동등 명령으로 cold build 1/2건의 성공, 20초 이내 완료, VM/파일/디스크 여유를 재확인한 뒤 한도를 확정한다. 각 요청의 HOME과 CLI 캐시도 요청 디렉터리 아래에 있어 종료 시 같이 지워진다. 배포 담당자는 template/macro/대형 출력 공격과 정상 컴파일을 동시에 실행해 정상 요청 및 서버 생존, cgroup `memory.events`의 `oom_kill` 미증가, 작업 후 디렉터리 삭제까지 확인한다.

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

- [ ] 고정된 base index digest로 이미지 빌드·checksum 및 Node 22 전체 테스트 성공.
- [ ] 운영과 동일한 제한에서 5-library 1/2건 재측정, 자식 한도·tmpfs/RAM 여유 및 공격 중 서버/다른 job 생존 확인.
- [ ] nginx를 통한 health와 실제 compile 성공. 반환 HEX와 한글 힌트 확인.
- [ ] 파일 탐색 우회 요청은 `reason: rejected`이고 외부 파일 내용이 응답에 없다.
- [ ] 소켓 디렉터리 0750, 소켓 0660, nginx 그룹 접근 가능. 재부팅 후 디렉터리 재생성됨.
- [ ] `docker inspect`에서 `NetworkMode=none`, 포트 바인딩 없음, 비특권 UID/GID, 읽기 전용 루트 및 리소스 제한 확인.
- [ ] 요청 제한, 동시성 제한, 시간 초과와 로그의 스케치·쿠키 비노출 확인.

## 실측 리소스 (2026-11-07, coms-circuit-lab-compiler:local, Apple Silicon Docker)

`compiler/measure.mjs`를 이미지 안에서 실행해 라이브러리 5종(Wire, LiquidCrystal_I2C, Servo, DHT, Adafruit_NeoPixel)을 쓰는 스케치를 컴파일한 값입니다.

| 동시 작업 | 총 RSS | arduino-cli VM | /tmp 사용 | 걸린 시간 |
|---|---|---|---|---|
| 1 | 212 MB | 1.52 GB | 1.8 MB | 0.97 s |
| 2 | 433 MB | 1.52 GB | 3.5 MB | 1.06 s |

이 수치는 아래 **1 GiB tmpfs, CPU/RAM 제한 없음** 조건에서 관찰됐다. 운영의 768 MiB 메모리, 1 CPU, 256 MiB tmpfs와 동일한 조건을 검증한 결과는 아니다. 기존 측정 명령:

```sh
docker run --rm --user 10001:10001 --tmpfs /tmp:size=1g,exec -v "$PWD/compiler:/m:ro" -w /m --entrypoint node coms-circuit-lab-compiler:local /m/measure.mjs 2
```
