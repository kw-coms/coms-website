# COM'S 스터디 코드 실행기

스터디 예제의 C, Java, Python 소스를 받아 컴파일·실행하고 표준 출력, 오류, 초보자용 진단을 JSON으로 돌려줍니다. API는 [`docs/study-runner-api.md`](../docs/study-runner-api.md)의 `POST /study/api/run`과 `GET /study/api/health`를 따릅니다. 인증은 이 서비스가 아니라 같은 출처의 nginx `auth_request` → 백엔드 `/api/auth/me`가 맡습니다. **인증된 회원만** 이 소켓에 접근하도록 nginx 위치 설정을 제한해야 합니다. HTML/CSS/JS는 기존 브라우저 샌드박스에서 실행합니다.

## 자원 제한

| 항목 | 제한 |
| --- | --- |
| 요청 | JSON 본문 96 KiB, 소스 64 KiB, stdin 16 KiB |
| 실행 | 동시 1개, 대기 8개까지; 초과 시 HTTP 429 `busy` |
| 빈도 | 기본 IP당 분당 10회; IPv6 /64 단위, 주소 테이블 초과 시 공유 버킷 |
| 시간 | 컴파일 벽시계 15초·CPU 10초; 실행 벽시계 10초·CPU 3초(Java 6초) |
| 메모리 | 컨테이너 768 MiB; gcc AS 1 GiB; C/Python 실행 AS 256 MiB; Java 실행 `-Xmx192m -XX:MaxMetaspaceSize=96m -Xss1m`, javac `-J-Xmx256m -J-XX:MaxMetaspaceSize=128m` |
| 프로세스·파일 | NPROC(작업 UID 전용) C/Python 32, Java 128; FSIZE 8 MiB, NOFILE 64(Java 256), CORE 0; 컨테이너 `pids_limit` 256 |
| 디스크 | `/jobs` tmpfs 64 MiB·inode 4096, `/dev/shm` 8 MiB; 작업 후 전부 삭제 |
| 출력 | stdout·stderr 각각 최대 64 KiB; 초과 시 프로세스 종료와 `truncated: true` |

JVM 공통 옵션: `-XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:CICompilerCount=1 -XX:ActiveProcessorCount=1 -XX:-UsePerfData -XX:+DisableAttachMechanism -Xshare:auto -Xlog:disable`(javac는 `-J-` 접두). `-Xlog:disable`은 JVM 경고가 학생 stdout에 섞이지 않게 합니다. `javac`/`java`에는 AS 제한을 적용하지 않습니다. JVM은 실제 힙보다 훨씬 넓은 가상 주소 공간을 예약하므로 RLIMIT_AS가 정상 실행까지 막을 수 있습니다. GCC는 `-std=c17 -O1 -Wall -Wextra -lm`, Python은 `python3 -I -u`, Java는 JDK 21을 사용합니다. CPU 제한의 hard 값은 soft 값보다 1초 크게 두고, 100ms마다 `/proc/<pid>/stat`를 읽어 soft budget에서 먼저 종료합니다. `SIGXCPU`와 벽시계 종료는 `timedOut`으로 표시합니다.

## 보안 모델

### 구조: 서버와 작업을 다른 UID로 분리

```
tini (PID 1, root)
└─ node server.mjs      uid 0, gid = nginx 그룹, 유효 capability = SETUID·SETGID·KILL 뿐
   └─ setpriv --reuid=10100 --regid=10100 --clear-groups --inh-caps=-all --ambient-caps=-all --no-new-privs
      └─ env -C /jobs/coms-… → prlimit(NPROC·CPU·FSIZE·AS…) → gcc / javac / java / python / ./program
```

- 서버는 컨테이너 root이지만 `cap_drop: ALL` 후 `SETUID`, `SETGID`, `KILL`만 남깁니다. `DAC_OVERRIDE`가 없으므로 UID 10100 소유 파일은 서버도 읽지 못합니다. `no-new-privileges`, 읽기 전용 루트, `network_mode: none`, private IPC/PID namespace를 함께 씁니다.
- 모든 컴파일·실행은 `setpriv`로 **UID/GID 10100**(보조 그룹 없음, capability 전부 0, `no_new_privs`)으로 전환한 뒤 실행합니다. root → 비root 전환에서 커널이 permitted/effective/ambient capability를 비우므로 실패 시 "닫힌" 쪽으로 동작합니다. 작업은 서버 프로세스에 신호를 보내거나 ptrace하거나 `/proc/<pid>/{mem,environ,fd,cwd}`를 열 수 없고(UID 불일치), `kill(-1)`도 서버에 닿지 않습니다. 작업 환경 변수는 `PATH, LANG, HOME, TMPDIR`뿐입니다.
- `RLIMIT_NPROC`은 UID 단위로 스레드까지 센다는 점이 핵심입니다. 서버와 같은 UID를 쓰면 JVM이 시작도 못 하고 포크 폭탄도 서버 쪽 프로세스를 세므로 막히지 않았습니다. 이제 작업 UID만 세므로 NPROC가 정확히 학생 프로세스를 제한합니다.
- 파일: `/jobs`(tmpfs, **root 소유, 모드 1777 sticky**)가 유일한 쓰기 위치입니다. 작업 UID는 마운트 루트를 chmod/rename/삭제할 수 없고 자기 항목만 만들거나 지울 수 있습니다(정리가 목록을 읽어야 해서 `1733`이 아니라 `1777`; 작업 UID가 유일한 사용자입니다). 작업마다 작업 UID가 만든 0700 하위 디렉터리 `/jobs/coms-<랜덤>`을 `TMPDIR`/`HOME`/cwd로 씁니다. 루트 파일시스템은 읽기 전용이며 `/tmp`, `/run/coms-study`(nginx와 공유하는 소켓 디렉터리, 소켓은 `root:nginx 0660`), `/app` 등은 10100이 쓸 수 없습니다. `/dev/shm`과 `/dev/mqueue`는 Docker가 1777로 만들기 때문에 쓰기가 가능하며 작업 후 지웁니다.
- 정리(작업 전·컴파일 후·작업 후): ① **작업 UID로** `kill -9 -1`을 반복 실행해 `setsid`/이중 fork 데몬을 포함한 모든 10100 프로세스를 종료하고 `/proc`에 남은 10100 프로세스(좀비 포함)가 없을 때까지 확인, ② 작업 UID로 `ipcrm --all` 후 `/proc/sysvipc/{shm,msg,sem}`에 uid/cuid 10100 객체가 없는지 확인, ③ 작업 UID로 `/jobs`·`/dev/shm`·`/dev/mqueue`(POSIX 메시지 큐 포함)의 10100 소유 항목에 `chmod -R u+rwx`(권한 000 트리 복구, 심볼릭 링크 제외) 후 `rm -rf`를 셸 없이 argv로 실행(종료 코드·타임아웃이 곧바로 예외)하고, 서버가 세 마운트가 **완전히 비었는지** 직접 읽어 확인. 하나라도 실패하면 러너는 오염(poisoned) 상태가 되어 해당 요청과 대기 요청에 `503 {"error":"unavailable"}`(Retry-After 30)를 돌려주고, 약 1.5초 뒤 서버가 **종료 코드 70으로 종료**합니다. tini도 함께 끝나 컨테이너가 종료되고 `restart: unless-stopped`가 새 컨테이너(비워진 tmpfs)로 다시 띄웁니다. 재시작 중 nginx 재시도는 필요 없고 클라이언트는 503 메시지를 보고 다시 시도하면 됩니다. 소유자가 직접 지우므로 `CAP_DAC_OVERRIDE`/`CAP_FOWNER`/`CAP_CHOWN`이 필요 없습니다.

### 대안 비교 (이 구조를 택한 이유)

| 대안 | 평가 |
| --- | --- |
| 서버를 비root(예: 10002)로 두고 setuid 헬퍼 사용 | `no-new-privileges`가 setuid/file capability 상승을 막아 동작하지 않음 |
| 비root 서버 + ambient capability(SETUID 등) | 가능하지만 setpriv 이후 ambient를 빠짐없이 비워야 하고(누락 시 학생 코드가 setuid(0) 가능), 서버가 어차피 SETUID를 가지므로 침해 시 root가 될 수 있어 실익이 거의 없음 |
| user namespace(rootless, `userns-remap`, `--userns`) | Docker Desktop·일반 Linux 호스트에서 전제할 수 없음 |
| 요청마다 일회용 컨테이너 | 가장 강하지만 Docker 소켓 접근이 필요해 서버가 호스트 root급이 됨. 이 구조는 컨테이너 안에서 끝남 |
| 위 구조(root + SETUID/SETGID/KILL, setpriv로 강등) | 추가 권한·특권 모드·userns 없이 Docker Desktop과 Linux 호스트 모두에서 동작. root→비root 전환이 capability를 기본적으로 제거 |

### 보호하는 것

- 학생 코드의 서버 프로세스·tini·다른 root 프로세스에 대한 신호, ptrace, `/proc` 접근
- 서버 환경 변수, 앱 소스 수정, 소켓 접속(소켓은 nginx 그룹 전용), 컨테이너 파일시스템 변경
- 이전 작업의 소스·산출물·`/dev/shm`·POSIX 큐·SysV IPC 열람(작업 사이에 모두 삭제)
- 포크/스레드 폭탄(UID별 NPROC + cgroup pids), 메모리·CPU·출력·파일 크기·디스크 폭주, 백그라운드 데몬 잔존
- 네트워크: `network_mode: none`(loopback만 UP, 라우트 없음; Docker는 DOWN 상태 터널 장치 `tunl0`, `gre0`, `sit0` 등을 만들기도 합니다)

### 보호하지 못하는 것 (잔여 위험)

- **커널 취약점·컨테이너 탈출**: 컨테이너는 커널을 호스트와 공유합니다. 기본 seccomp 프로파일과 capability 제거가 표면을 줄일 뿐입니다. 호스트 커널을 최신으로 유지하고 이 컨테이너 외에 민감한 워크로드를 같은 호스트에 두지 마세요. 더 강한 격리(gVisor, Firecracker)는 범위 밖입니다.
- **UID 10100은 호스트 전역 네임스페이스에서 공유됩니다**(userns 미사용). 같은 UID를 쓰는 다른 컨테이너·호스트 계정이 있으면 `RLIMIT_NPROC` 계수가 섞이고, 호스트 쪽 UID 10100 소유 파일과 권한이 겹칩니다. 이 UID를 다른 용도에 쓰지 마세요.
- 같은 작업 안의 CPU 경쟁·DoS: 컨테이너는 한 개의 CPU를 쓰므로 한 작업이 최대 한도까지 CPU를 점유합니다(대기열 8개 + 429로 제한). 같은 호스트의 다른 컨테이너와 CPU·메모리를 경쟁할 수 있습니다.
- 작업은 `/proc`을 통해 서버와 tini의 존재·cmdline·상태를 읽을 수 있습니다(비밀 아님). PID namespace는 컨테이너 단위라서 작업 간 프로세스 격리는 순차 실행과 정리로 보장합니다(동시 작업 없음).
- 비밀(토큰, 키)을 컨테이너 환경 변수나 파일에 넣지 마세요. 작업이 직접 읽지는 못하지만 방어를 한 겹 더 두는 것입니다.
- capability bounding set은 `SETUID, SETGID, KILL`로 남습니다(`CAP_SETPCAP` 없이는 줄일 수 없음). 작업 프로세스는 비root + `no_new_privs`이고 파일 capability가 없어 이를 사용할 수 없으며 테스트가 이를 확인합니다.
- 정리 실패는 위처럼 프로세스 종료 → 컨테이너 자동 재시작으로 복구됩니다(회귀 테스트: root 소유 잔여 파일로 503과 종료 코드 70 확인). 재시작 사이 몇 초 동안은 요청이 실패합니다.
- 개발 Compose는 포트와 브리지 네트워크를 열므로(작업이 외부 네트워크에 접근 가능) 신뢰할 수 있는 로컬 입력에만 사용하세요.

## 실행

```sh
cd runner
docker compose -f docker-compose.dev.yml up --build
curl -fsS http://127.0.0.1:8788/study/api/health
curl -fsS -H 'Content-Type: application/json' -d '{"lang":"python","code":"print(input())","stdin":"hello"}' http://127.0.0.1:8788/study/api/run
```

프로덕션에서는 nginx와 runner가 `coms-study-runner-socket` 볼륨(소켓 전용 1 MiB tmpfs)을 공유합니다. `NGINX_GID`를 nginx 프로세스의 그룹 ID로 지정하고 `NGINX_GID=101 docker compose -f docker-compose.yml up --build -d`를 실행하세요. 서버의 기본 그룹이 nginx 그룹이라서 소켓은 `root:nginx 0660`으로 만들어집니다. nginx는 `unix:/run/coms-study/run.sock`으로 프록시하고 `auth_request`를 먼저 적용해야 합니다. 서비스에 TCP 포트는 노출되지 않습니다. 헬스체크는 같은 소켓으로 `/study/api/health`를 호출합니다.

프로덕션에서 nginx는 신뢰할 수 있는 마지막 프록시여야 합니다. `X-Forwarded-For`를 클라이언트 값 대신 `$remote_addr`로 덮어쓰고, upstream 읽기 제한은 최대 9개 작업의 대기까지 수용하도록 250초 이상으로 설정하세요. 이 컨테이너에 다른 서비스나 `docker exec` 작업을 띄우지 마세요(정리가 10100 프로세스를 전부 종료합니다).

## 검증

```sh
cd runner
node --test test/*.test.mjs        # 단위·HTTP 테스트(호스트에서 실행 가능)
docker build -t coms-study-runner:local .
docker run --rm --network none --user 0:101 --read-only \
  --tmpfs "/jobs:rw,exec,nosuid,nodev,size=64m,nr_inodes=4096,mode=1777" \
  --tmpfs /run/coms-study:rw,nosuid,nodev,size=1m,mode=0755 \
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add KILL \
  --security-opt no-new-privileges:true \
  --memory 768m --memory-swap 768m --cpus 1 --pids-limit 256 --ipc private --shm-size 8m \
  -e RUNNER_TOOLCHAIN_TESTS=1 -e RUNNER_CONTAINER_ATTACK_TESTS=1 \
  -w /app coms-study-runner:local node test/toolchain.mjs
```

`test/toolchain.mjs`는 실제 컴파일러·런타임과 공격 시나리오(권한 상승, 서버 신호·ptrace, 쓰기 범위, 소켓 접근, 작업 간 잔여물, IPC/POSIX 큐, 포크·스레드·multiprocessing 폭탄, stdin 폭주, 이진·초장문 출력, 네트워크 차단 등)를 실행합니다. 프로덕션과 같은 제한의 일회용 컨테이너에서 `node --test` 없이 직접 실행해야 하며(작업 UID 프로세스를 전부 종료함), 호스트에서는 건너뜁니다. 명령은 `--user 0:101`(root, 그룹 101)로 프로덕션 Compose의 `user: "0:$NGINX_GID"`와 같은 형태입니다. 실제 서비스 경로는 `NGINX_GID=101 docker compose up -d` 후 `docker exec`로 소켓에 요청하여 확인할 수 있습니다.

실측(Docker Desktop, 위 제한): C hello 약 40 ms, Python 약 25 ms, Java hello 약 300–370 ms / Scanner 약 450–580 ms(첫 실행 포함, `timeMs`는 대기열·마지막 정리 제외). 컨테이너 cgroup 최대 메모리: C/Python 약 20 MiB, Java 약 55 MiB(서버 포함). 이미지의 Debian 패키지 버전은 `/opt/runner/apt-versions.txt`에 기록됩니다.
