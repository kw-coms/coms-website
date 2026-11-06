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

Dockerfile은 amd64 / arm64 CLI 바이너리의 **리터럴 SHA-256**을 검사한다. AVR 코어와 라이브러리는 빌드 시 설치하고, `--no-deps`로 DHT의 의존성이 임의로 최신 버전으로 바뀌지 않게 한다. 설치 인덱스와 패키지는 Arduino CLI가 검증한다. 다운로드용 curl 등은 builder에만 있고 최종 이미지에는 Node, Arduino 도구, 필요한 공유 라이브러리와 CA 인증서만 남긴다. 호스트 디렉터리·Docker 소켓·시크릿을 마운트하지 않는다.

```sh
# 저장소 루트에서. Node 22로도 반드시 검증한다.
node --test compiler/test/
npm --prefix compiler test
docker build --pull --platform linux/amd64 -t coms-circuit-lab-compiler:release compiler/
docker compose -f compiler/docker-compose.yml up --build -d
curl --fail http://127.0.0.1:8787/lab/api/health
```

Compose는 개발용으로 인증과 proxy 신뢰를 끈다. non-root uid 1000, read-only root, 256 MiB `/tmp` tmpfs (`noexec,nosuid,nodev`), 모든 capability 제거, no-new-privileges, RAM 768 MiB(추가 swap 없음), CPU 1개, PID 128개를 적용한다. `init: true`로 고아 프로세스를 수거한다. 코어·라이브러리는 `/opt/arduino`에 읽기 전용으로 설치하고 캐시와 작업 파일은 `/tmp`만 사용한다.

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
    proxy_pass http://127.0.0.1:8787;
    # proxy_pass에 trailing /를 붙이지 않는다: /lab/api/... 경로 보존
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
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
curl --fail https://coms.kw.ac.kr/lab/api/health
curl --fail -I https://coms.kw.ac.kr/lab/
```

nginx보다 앱의 본문 제한(80 KiB)이 작다. nginx가 먼저 차단한 100 KiB 초과 요청 등은 nginx 자체 응답일 수 있다. 앱 자체는 잘못된 JSON·타입·크기를 HTTP 400 `reason: rejected`로 반환한다. API에 CORS 헤더를 추가하지 않는다. nginx 앞에 신뢰 프록시가 있다면 그 프록시에 한정한 `real_ip` 설정을 검증한 뒤 `$remote_addr`를 사용한다.

**대기시간 주의:** 2개 실행 + 6개 대기에서 작업마다 20초가 걸리면 마지막 요청은 약 80초가 필요하다. 위 요구 설정의 `proxy_read_timeout 30s`에서는 긴 대기 요청이 먼저 504가 될 수 있다. 클라이언트는 즉시 무한 재시도하지 않아야 한다. 모든 대기 요청의 완료 응답을 보장해야 하는 운영 정책이라면 nginx와 클라이언트 제한을 함께 95초 이상으로 조정한다. 끊긴 연결의 대기 작업은 실행 시 건너뛰지만 이미 실행 중인 컴파일은 최대 20초 안에 종료한다.

## 4. 프로덕션 컨테이너와 외부 통신 차단

[Compose의 `internal: true`](https://docs.docker.com/reference/compose-file/networks/#internal)는 외부 통신이 격리된 네트워크를 만든다. `network_mode: none`은 포트 공개를 사용할 수 없으므로 사용하지 않는다. 호스트 nginx는 `127.0.0.1:8787`에 연결한다. Docker Engine/OS에 따라 internal bridge의 published port 동작이 다를 수 있으므로 **같은 호스트에서 health와 실제 compile을 확인**해야 한다.

아래는 Linux Docker Engine 예시다. `172.30.87.0/24`가 기존 네트워크와 겹치지 않는지 먼저 확인한다. 방화벽 명령은 iptables 백엔드 기준이며 nftables 네이티브 환경에서는 동등한 규칙으로 적용한다.

```sh
docker network create --driver bridge --internal \
  --subnet 172.30.87.0/24 --gateway 172.30.87.1 \
  -o com.docker.network.bridge.name=br-coms-lab coms-lab-isolated

# 호스트 접근도 제한: 응답 트래픽, 선택적 인증 HTTPS만 허용한다.
# 인증을 끄는 경우 --dport 443 ACCEPT 규칙은 생략할 수 있다.
sudo iptables -N COMS_LAB_HOST
sudo iptables -A COMS_LAB_HOST -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A COMS_LAB_HOST -d 172.30.87.1 -p tcp --dport 443 -j ACCEPT
sudo iptables -A COMS_LAB_HOST -j DROP
sudo iptables -I INPUT 1 -i br-coms-lab -j COMS_LAB_HOST

# 라우팅을 통한 새 외부 연결 차단. 호스트/프록시에 대한 응답은 허용한다.
sudo iptables -N COMS_LAB_EGRESS
sudo iptables -A COMS_LAB_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A COMS_LAB_EGRESS -j DROP
sudo iptables -I DOCKER-USER 1 -i br-coms-lab -j COMS_LAB_EGRESS

docker run -d --name coms-circuit-lab-compiler \
  --restart unless-stopped --init --stop-timeout 25 \
  --network coms-lab-isolated \
  --publish 127.0.0.1:8787:8787 \
  --read-only --user 1000:1000 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 768m --memory-swap 768m --cpus 1.0 --pids-limit 128 \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --env TRUST_PROXY=1 \
  coms-circuit-lab-compiler:release
```

기존 Compose 개발 컨테이너와 production 컨테이너를 같은 8787 포트에 동시에 띄우지 않는다. 방화벽 체인은 최초 1회 생성하고 재배포 시 중복 삽입하지 않는다. 배포 환경의 방화벽 저장 도구로 재부팅 뒤에도 보존하고 Docker 재시작 후 규칙 순서를 재검증한다. IPv6는 이 네트워크에서 활성화하지 않는다.

internal bridge에서 localhost 포트가 실제로 동작하지 않는 Engine이면, 컨테이너를 내린 뒤 **위 INPUT/DOCKER-USER 차단 규칙을 유지한 상태에서** 동일한 subnet/bridge 이름의 일반 bridge로 네트워크를 다시 만든다(`--internal`만 제외). 차단 규칙 없이 일반 bridge를 사용하지 않는다. egress 차단이 된 채로 published port와 컴파일이 성공하는지 확인한다. 이것은 완전한 VM 격리가 아니다. 일반 호스트 작업이나 다른 서비스와 디렉터리·시크릿을 공유하지 않는다.

## 5. 선택적 동아리 로그인 확인

기본값은 비활성화다. 활성화하려면 위 `docker run`의 이미지 이름 앞에 다음 옵션을 넣는다.

```sh
--env AUTH_CHECK_URL=https://coms.kw.ac.kr/api/auth/me \
--add-host coms.kw.ac.kr:172.30.87.1
```

인접 저장소 `../coms-website/backend/src/main/java/com/coms/backend/controller/AuthController.java`에서 `@RequestMapping("/api/auth")` + `@GetMapping("/me")`를 확인했다. `JwtAuthenticationFilter`는 쿠키 토큰을 읽는다. 공개된 최신 서버와 동일한 구현인지는 smoke test로 확인한다.

외부 인터넷 대신 같은 호스트의 nginx HTTPS에 접근하도록 도메인을 bridge gateway로 매핑한다. TLS 인증서는 계속 `coms.kw.ac.kr`에 대해 검증된다. 호스트 nginx가 해당 gateway의 443에서도 수신하고 위 INPUT 예외가 적용돼 있어야 한다. 인증 서버가 다른 호스트에 있으면 별도 고정 목적지 HTTPS 프록시와 좁은 방화벽 예외가 필요하며, 일반 인터넷 egress를 열어 해결하지 않는다.

서버는 받은 `Cookie`만 고정된 인증 URL에 GET으로 전달한다. 3초 제한, redirect 금지, 정확히 HTTP 200만 승인하며 응답 본문은 저장하지 않는다. 200 여부가 회원 판정의 기준이므로 `/api/auth/me` 자체의 계정 상태 정책도 운영자가 확인한다. 실패·타임아웃·redirect는 HTTP 401과 다음 고정 메시지를 반환한다.

```json
{"ok":false,"reason":"rejected","errors":[{"line":0,"severity":"error","message":"로그인한 동아리원만 컴파일할 수 있어요."}]}
```

로그에 쿠키, 스케치, 컴파일러 출력, IP를 기록하지 않는다. JSON 한 줄에 request id, HTTP 상태, 처리 시간, 실패 reason만 남긴다.

## 6. 요청 검증·실행 정책

- JSON 본문 80 KiB, 스케치 UTF-8 64 KiB 제한. JSON Content-Type만 허용하며 압축 본문은 거부한다.
- 허용 헤더: `Arduino.h`, `Wire.h`, `SPI.h`, `Servo.h`, `LiquidCrystal_I2C.h`, `DHT.h`, `Adafruit_Sensor.h`, `Adafruit_NeoPixel.h`, `EEPROM.h`, `math.h`, `string.h`, `stdlib.h`, `avr/pgmspace.h`.
- quoted/macro include, 절대·상대 경로, `..`, 역슬래시, 목록 밖의 슬래시 경로를 거부한다. 줄 연결을 처리한 다음 주석을 제거하고 각 줄을 검사한다.
- `__has_include`, `include_next`, `import`, pragma, `asm` 계열, `incbin`, 토큰 결합, 대체 전처리 기호, raw 문자열, 숫자 구분자, 접두 문자 리터럴과 `#line`도 보수적으로 거부한다. 교육용 C++ 부분집합이며 일반 C++ 전체를 지원하는 서비스가 아니다. 조건부 컴파일로 비활성화된 코드도 검사한다.
- shell 없이 고정 argv로 `arduino-cli compile --fqbn arduino:avr:uno --jobs 1 --warnings all --build-path <tmp>/build --output-dir <tmp>/out sketch`를 실행한다.
- 요청별 임시 폴더, 20초 제한, detached 프로세스 그룹 전체 SIGKILL, `finally` 삭제. 생성 HEX를 실행하거나 보드에 업로드하지 않는다.
- 최대 2개 실행 + 6개 FIFO 대기, 초과 시 429 `busy`. IP별 고정 60초 창 10회, 초과 시 429 `rate-limited`. 상태는 프로세스 메모리에 있으므로 재시작 시 초기화되며 다중 replica에 공유되지 않는다.
- `TRUST_PROXY=1`일 때만 X-Forwarded-For 첫 주소를 신뢰한다. nginx는 이를 덮어쓰고 외부에서 8787에 직접 접근할 수 없어야 한다.
- GCC 진단은 원본 `sketch.ino` 줄·열을 추출하며 위치가 없는 linker 오류는 line 0이다. 절대 경로·임시 폴더 이름을 지우고 진단 30개 × 메시지 800자, 프로세스 출력 256 KiB, HEX 192 KiB로 제한한다. HEX 체크섬을 확인하고 bootloader HEX는 반환하지 않는다. `sizeBytes`는 HEX의 데이터 바이트 합계다.
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
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=bind,src="$PWD/compiler",dst=/tests,readonly \
  --workdir /tests node:22-bookworm-slim node --test test/
```

## 8. 배포 smoke checklist

```sh
curl --fail http://127.0.0.1:8787/lab/api/health
curl --fail https://coms.kw.ac.kr/lab/api/health
curl -sS -H 'Content-Type: application/json' \
  --data '{"sketch":"void setup() {}\nvoid loop() {}"}' \
  http://127.0.0.1:8787/lab/api/compile
curl -sS -H 'Content-Type: application/json' \
  --data '{"sketch":"#include <../../etc/passwd>\nvoid setup() {}\nvoid loop() {}"}' \
  http://127.0.0.1:8787/lab/api/compile
# 일반 인터넷 요청은 실패해야 한다(연결 성공이면 배포 중단).
docker exec coms-circuit-lab-compiler node --input-type=module -e \
  'try { await fetch("https://example.com", {signal: AbortSignal.timeout(3000)}); process.exit(1); } catch { console.log("egress denied"); }'
```

- [ ] 실제 amd64/arm64 대상 Docker 빌드 성공, checksum 검사 통과, 코어·모든 라이브러리 설치 버전 확인.
- [ ] Node 22에서 전체 테스트 성공. 샌드박스 `listen EPERM` 때문에 생긴 HTTP 테스트 skip은 호스트/Docker에서 해소.
- [ ] read-only/tmpfs/noexec/cap-drop/리소스 제한 그대로 cold compile 성공, 반복·동시 2개 compile도 성공. 필요 작업 경로에 쓰기 권한 오류가 없는지 확인.
- [ ] 모든 허용 헤더와 Servo, LCD, DHT, NeoPixel 예제가 실제 Uno HEX로 컴파일됨. 원본 줄 번호와 Korean hint를 실제 GCC 오류로 확인.
- [ ] 반환 HEX가 시뮬레이터에서 실행되며, `sizeBytes`와 Uno 플래시 사용량이 일치. 부트로더 파일을 선택하지 않음.
- [ ] 64 KiB 초과, 80 KiB 초과, JSON 오류, quoted/path/continuation/include_next/incbin 우회가 거부됨.
- [ ] 11번째 IP 요청 429, 여러 IP 동시 9번째 컴파일 429 busy, 20초 초과 작업 및 자식 프로세스 종료, `/tmp/circuit-lab-*` 삭제. nginx 제한 때문에 큐 테스트가 가려지면 격리된 호스트 테스트로 분리.
- [ ] localhost published port는 열리고 외부 호스트의 8787 접근 및 컨테이너 일반 인터넷 연결은 차단. DNS 실패만으로 egress 차단을 단정하지 말고 관리자가 허용한 테스트 목적지의 고정 IP TCP 연결도 실패하는지 확인.
- [ ] 인증 ON: 유효한 동아리원 세션 200 compile, 무쿠키/만료 쿠키 401, auth timeout/redirect 401. 쿠키를 문서나 로그에 복사하지 않음.
- [ ] `/lab/` 정적 파일·직접 새로고침·SPA 경로·API 경로가 섞이지 않음. XFF 위조가 nginx에서 덮어써짐. API에 CORS 헤더 없음.
- [ ] nginx reload·호스트 재부팅 뒤에도 방화벽과 restart 정책 유지. 로그·응답에 스케치 원문, 절대 경로, 임시 폴더 이름, 쿠키 없음.
