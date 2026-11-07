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
└─ node server.mjs      uid 0, gid = nginx 그룹, 유효 capability = SETUID·SETGID·KILL·SYS_RESOURCE 뿐
   └─ setpriv --reuid=10100 --regid=10100 --clear-groups --inh-caps=-all --ambient-caps=-all --no-new-privs
      └─ env -C /jobs/coms-… → prlimit(NPROC·CPU·FSIZE·AS…) → gcc / javac / java / python / ./program
```

- 서버는 컨테이너 root이지만 `cap_drop: ALL` 후 `SETUID`(작업 UID 전환), `SETGID`, `KILL`(타임아웃 시 프로세스 그룹 종료), `SYS_RESOURCE`(작업에 `oom_score_adj=1000`을 고정; 아래 OOM 항목)만 남깁니다. `DAC_OVERRIDE`가 없으므로 UID 10100 소유 파일은 서버도 읽지 못합니다. `no-new-privileges`, 읽기 전용 루트, `network_mode: none`, private IPC/PID namespace를 함께 씁니다.
- 모든 컴파일·실행은 `setpriv`로 **UID/GID 10100**(보조 그룹 없음, capability 전부 0, `no_new_privs`)으로 전환한 뒤 실행합니다. root → 비root 전환에서 커널이 permitted/effective/ambient capability를 비우므로 실패 시 "닫힌" 쪽으로 동작합니다. 작업은 서버 프로세스에 신호를 보내거나 ptrace하거나 `/proc/<pid>/{mem,environ,fd,cwd}`를 열 수 없고(UID 불일치), `kill(-1)`도 서버에 닿지 않습니다. 작업 환경 변수는 `PATH, LANG, HOME, TMPDIR`뿐입니다.
- `RLIMIT_NPROC`은 UID 단위로 스레드까지 센다는 점이 핵심입니다. 서버와 같은 UID를 쓰면 JVM이 시작도 못 하고 포크 폭탄도 서버 쪽 프로세스를 세므로 막히지 않았습니다. 이제 작업 UID만 세므로 NPROC가 정확히 학생 프로세스를 제한합니다.
- 파일: `/jobs`(tmpfs, **root 소유, 모드 1777 sticky**)가 유일한 쓰기 위치입니다. 작업 UID는 마운트 루트를 chmod/rename/삭제할 수 없고 자기 항목만 만들거나 지울 수 있습니다(정리가 목록을 읽어야 해서 `1733`이 아니라 `1777`; 작업 UID가 유일한 사용자입니다). 작업마다 작업 UID가 만든 0700 하위 디렉터리 `/jobs/coms-<랜덤>`을 `TMPDIR`/`HOME`/cwd로 씁니다. 루트 파일시스템은 읽기 전용이며 `/tmp`, `/run/coms-study`(nginx와 공유하는 소켓 디렉터리, 소켓은 `root:nginx 0660`), `/app` 등은 10100이 쓸 수 없습니다. `/dev/shm`과 `/dev/mqueue`는 Docker가 1777로 만들기 때문에 쓰기가 가능하며 작업 후 지웁니다.
- 정리(작업 전·컴파일 후·작업 후): ① **특권을 가진 서버가 직접**(CAP_KILL) `/proc`을 훑어 uid(실제·유효·저장·fs)가 10100인 모든 PID에 `SIGKILL`을 보내(`setsid`/이중 fork 데몬, `SIGSTOP`을 뿌리는 공격 프로세스 포함; SIGKILL은 막거나 멈출 수 없음) 비동기로 반복하며(데드라인 3초, 이벤트 루프를 막지 않음) `/proc`에 남은 10100 프로세스(좀비 포함)가 없을 때까지 확인, ② 서버가 `/proc/sysvipc/{shm,msg,sem}`를 직접 읽어 uid 또는 cuid가 10100인 객체를 골라 작업 UID로 `ipcrm -m/-q/-s <id>`로 하나씩 제거(`ipcrm --all`은 권한 검사로 모드 0 객체를 건너뛰므로 쓰지 않음; 소유자·생성자는 모드와 무관하게 IPC_RMID 가능, IPC_SET으로 uid를 넘겨도 cuid로 제거됨. 붙은 shm은 ①에서 attacher가 죽은 뒤 사라짐)한 뒤 다시 읽어 남은 객체가 없는지 확인, ③ 작업 UID로 `/jobs`·`/dev/shm`·`/dev/mqueue`(POSIX 메시지 큐 포함)의 10100 소유 항목에 `chmod -R u+rwx`(권한 000 트리 복구, 심볼릭 링크 제외) 후 `rm -rf`를 셸 없이 argv로 실행(종료 코드·타임아웃이 곧바로 예외)하고, 서버가 세 마운트가 **완전히 비었는지** 직접 읽어 확인. 작업 UID로 실행하는 보조 프로세스(IPC 제거, 파일 삭제, 작업 디렉터리 생성)는 항상 ①로 모든 작업 프로세스를 먼저 죽인 뒤 비동기 `spawn`(SIGKILL 데드라인 10~15초)으로 실행하며 시간 초과도 정리 실패입니다. 동기 `execFileSync`/`spawnSync`는 어떤 경로에도 없습니다(테스트가 소스를 검사). 하나라도 실패하면 러너는 오염(poisoned) 상태가 되어 해당 요청과 대기 요청에 `503 {"error":"unavailable"}`(Retry-After 30)를 돌려주고, 약 1.5초 뒤 서버가 **종료 코드 70으로 종료**합니다. tini도 함께 끝나 컨테이너가 종료되고 `restart: unless-stopped`가 새 컨테이너(비워진 tmpfs)로 다시 띄웁니다. 재시작 중 nginx 재시도는 필요 없고 클라이언트는 503 메시지를 보고 다시 시도하면 됩니다. 소유자가 직접 지우므로 `CAP_DAC_OVERRIDE`/`CAP_FOWNER`/`CAP_CHOWN`이 필요 없습니다.

### seccomp 프로파일

Docker 데몬의 기본값(Docker Desktop은 `seccomp=unconfined`로 보고될 수 있음)에 의존하지 않고 `runner/seccomp.json`을 두 Compose 파일의 `security_opt: seccomp=${RUNNER_SECCOMP:-./seccomp.json}`로 명시합니다. 이 파일을 포함하는 루트 Compose는 `RUNNER_SECCOMP=./runner/seccomp.json`을 지정하세요. 내용은 **Docker 29.9.0**(vendor `moby/profiles/seccomp/default.json`)의 공식 프로파일에서 *무조건 허용* 항목인 `ptrace`, `process_vm_readv`, `process_vm_writev`만 제거한 것입니다(툴체인에 불필요). 프로파일에는 `CAP_SYS_PTRACE` 같은 capability 조건부 허용 항목이 그대로 남아 있지만 컨테이너가 그 capability를 갖지 않으므로 효력이 없습니다. `mount`, 사용자 네임스페이스 `unshare`/`clone`, `bpf`, `keyctl` 등은 기본 프로파일대로 막힙니다. `test/toolchain.mjs`가 작업의 `/proc/self/status`에서 `Seccomp: 2`를 확인하고 `unshare(CLONE_NEWUSER)`, `mount`, `ptrace(TRACEME)`가 `-1`임을 검증하며, `test/compose-e2e.mjs`는 Compose로 띄운 컨테이너의 PID 1과 작업 모두 `Seccomp: 2`임을 확인합니다. 엔진을 올릴 때 새 `default.json`과 비교하세요.

### OOM과 IPC 한도

768 MiB cgroup은 Node 서버와 작업이 함께 씁니다. 작업이 메모리를 폭주시켜도 커널 OOM killer가 서버를 고르지 않도록 ① 모든 작업은 `choom -n 1000`으로 `oom_score_adj=1000`을 받습니다. 값을 쓰는 프로세스가 `CAP_SYS_RESOURCE`를 가지고 있으면 `oom_score_adj_min`도 고정되므로, 비root가 된 작업은 값을 다시 낮출 수 없습니다(이 권한은 root에서 UID 전환 때 사라지며, 낮추기 시도는 테스트로 확인). 서버는 0입니다. ② 이름공간별 sysctl로 IPC를 작게 제한합니다: SysV shm 합계 16 MiB(`shmall=4096` 페이지)·세그먼트당 4 MiB·최대 64개, 메시지 큐 `msgmni=32`·`msgmnb=16384`, 세마포어 `kernel.sem=32 1024 32 64`, POSIX 큐 `fs.mqueue.queues_max=16`(`msg_max=10`, `msgsize_max=8192`), `/dev/shm`은 명시적 tmpfs 8 MiB·inode 1024. prlimit로 `--msgqueue=262144 --sigpending=512 --locks=16`도 둡니다. ③ 그래도 서버가 비정상 종료(OOM, SIGKILL, 크래시)하면: 작업 시작 **전에** `{clientKey, jobId, startedAt}`를 상태 볼륨의 `inflight.json`에 fsync로 기록하고 정리 후 지웁니다. 시작 시 이 기록이 남아 있으면 그 클라이언트를 deny-list에 올리고 `recovered-inflight`를 로그합니다(SIGTERM 정상 종료 시에는 기록을 지워 오탐하지 않음).

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
- capability bounding set은 `SETUID, SETGID, KILL, SYS_RESOURCE`로 남습니다(`CAP_SETPCAP` 없이는 줄일 수 없음; `SYS_RESOURCE`도 포함). 작업 프로세스는 비root + `no_new_privs`이고 파일 capability가 없어 이를 사용할 수 없으며 테스트가 이를 확인합니다.
- 정리 실패는 위처럼 프로세스 종료 → 컨테이너 자동 재시작으로 복구됩니다(회귀 테스트: root 소유 잔여 파일로 503과 종료 코드 70 확인). 재시작 사이 몇 초 동안은 요청이 실패합니다.
- **재시작 남용**: 정리를 일부러 실패시켜 재시작을 유발하는 요청은 비용이 큽니다. 실패를 일으키거나 서버를 비정상 종료시킨 요청의 클라이언트 키(아래 *클라이언트 키* 참고)를 `/var/lib/coms-study/denylist.json`에 기록하고, 재시작 후 15분 동안 그 키는 `429 rate-limited`(Retry-After 900)를 받습니다. 메모리 속 속도 제한기는 재시작하면 초기화되므로(tmpfs 볼륨은 컨테이너 중지 때 비워지는 것을 확인) 이 파일만 **디스크 기반 named volume** `coms-study-runner-state`에 둡니다(작업 UID는 쓸 수 없음, 항목 최대 1000개). 키가 회원 단위이므로 같은 NAT의 다른 회원은 영향을 받지 않습니다(개발 모드의 IP 키에서만 NAT 공유 문제가 있음). 파일은 0600, 디렉터리는 0700(root), 원자적 기록(tmp+fsync+rename)이며 읽을 때 만료 시각을 `지금+15분`으로 제한하고 읽기·쓰기 실패는 로그로 남깁니다. `Retry-After`는 남은 초입니다.
- 개발 Compose는 포트와 브리지 네트워크를 열므로(작업이 외부 네트워크에 접근 가능) 신뢰할 수 있는 로컬 입력에만 사용하세요.

## 실행

```sh
cd runner
docker compose -f docker-compose.dev.yml up --build
curl -fsS http://127.0.0.1:8788/study/api/health
curl -fsS -H 'Content-Type: application/json' -d '{"lang":"python","code":"print(input())","stdin":"hello"}' http://127.0.0.1:8788/study/api/run
```

프로덕션에서는 nginx와 runner가 `coms-study-runner-socket` 볼륨(소켓 전용 1 MiB tmpfs)을 공유합니다. `NGINX_GID`를 nginx 프로세스의 그룹 ID로 지정하고 `NGINX_GID=101 docker compose -f docker-compose.yml up --build -d`를 실행하세요. 서버의 기본 그룹이 nginx 그룹이라서 소켓은 `root:nginx 0660`으로 만들어집니다. nginx는 `unix:/run/coms-study/run.sock`으로 프록시하고 `auth_request`를 먼저 적용해야 합니다. 서비스에 TCP 포트는 노출되지 않습니다. 헬스체크는 같은 소켓으로 `/study/api/health`를 호출합니다.

### 클라이언트 키와 nginx 설정

`TRUST_PROXY=1`(프로덕션)이면 키는 nginx가 `auth_request_set $runner_client $upstream_http_x_member_id;`로 채워 `proxy_set_header X-Runner-Client $runner_client;`로 전달하는 헤더 값입니다(클라이언트가 보낸 같은 이름의 헤더는 덮어씁니다). 값은 `^[A-Za-z0-9_-]{1,64}$`여야 하며 `m:` 접두사를 붙여 속도 제한(기본 회원당 분당 10회), deny-list, **회원당 동시 1건** 제한(큐를 한 명이 채울 수 없음)에 씁니다. 헤더가 없거나 형식이 틀리면 `401`입니다. 개발 모드(`TRUST_PROXY=0`)는 접속 IP를 키로 씁니다. 로그에는 키의 SHA-256 앞 8자리만 남습니다.

시간 예산: 큐에서 25초 안에 시작하지 못한 요청은 `429 busy`(Retry-After 20)로 끝나고, 컴파일 15초 + 실행 10초 + 정리를 더해도 요청 하나가 55초를 넘지 않습니다. 서버 `server.timeout`은 58초이므로 프런트 nginx의 `proxy_read_timeout`은 **58초 정도**(호스트 기본 60초 이하)로 두세요. 상위 nginx가 `X-Real-IP $remote_addr`를 덮어쓰도록 하는 것은 로그 용도일 뿐 키로 쓰지 않습니다. 이 컨테이너에 다른 서비스나 `docker exec` 작업을 띄우지 마세요(정리가 10100 프로세스를 전부 종료합니다).

## 검증

```sh
cd runner
node --test test/*.test.mjs        # 단위·HTTP 테스트(호스트에서 실행 가능)
docker build -t coms-study-runner:local .
docker run --rm --network none --user 0:101 --read-only \
  --tmpfs "/jobs:rw,exec,nosuid,nodev,size=64m,nr_inodes=4096,mode=1777" \
  --tmpfs /run/coms-study:rw,nosuid,nodev,size=1m,mode=0755 \
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add KILL --cap-add SYS_RESOURCE \
  --security-opt no-new-privileges:true --security-opt seccomp=seccomp.json \
  --memory 768m --memory-swap 768m --cpus 1 --pids-limit 256 --ipc private \
  --tmpfs /dev/shm:rw,noexec,nosuid,nodev,size=8m,nr_inodes=1024,mode=1777 \
  --sysctl kernel.shmmax=4194304 --sysctl kernel.shmall=4096 --sysctl kernel.shmmni=64 --sysctl kernel.msgmax=8192 \
  --sysctl kernel.msgmnb=16384 --sysctl kernel.msgmni=32 --sysctl 'kernel.sem=32 1024 32 64' \
  --sysctl fs.mqueue.queues_max=16 --sysctl fs.mqueue.msg_max=10 --sysctl fs.mqueue.msgsize_max=8192 \
  -e RUNNER_TOOLCHAIN_TESTS=1 -e RUNNER_CONTAINER_ATTACK_TESTS=1 \
  -w /app coms-study-runner:local node test/toolchain.mjs
```

`test/toolchain.mjs`는 실제 컴파일러·런타임과 공격 시나리오(권한 상승, 서버 신호·ptrace, 쓰기 범위, 소켓 접근, 작업 간 잔여물, IPC/POSIX 큐, 포크·스레드·multiprocessing 폭탄, stdin 폭주, 이진·초장문 출력, 네트워크 차단 등)를 실행합니다. 프로덕션과 같은 제한의 일회용 컨테이너에서 `node --test` 없이 직접 실행해야 하며(작업 UID 프로세스를 전부 종료함), 호스트에서는 건너뜁니다. 명령은 `--user 0:101`(root, 그룹 101)로 프로덕션 Compose의 `user: "0:$NGINX_GID"`와 같은 형태입니다. 실제 서비스 경로는 `NGINX_GID=101 docker compose up -d` 후 `docker exec`로 소켓에 요청하여 확인할 수 있습니다.

프로덕션 Compose 파일 자체로 검증하려면(권장; 같은 caps·sysctl·tmpfs·seccomp·볼륨 적용):

```sh
cd runner
export NGINX_GID=101
# Throw-away volume names: never run tests against the production volumes (coms-study-runner-*).
export RUNNER_SOCKET_VOLUME=test-socket-$$ RUNNER_STATE_VOLUME=test-state-$$
docker compose -p studyrt -f docker-compose.yml build
docker compose -p studyrt -f docker-compose.yml run --rm --no-deps \
  -e RUNNER_TOOLCHAIN_TESTS=1 -e RUNNER_CONTAINER_ATTACK_TESTS=1 -e RUNNER_EXPECT_IPC_LIMITS=1 runner node test/toolchain.mjs
docker compose -p studyrt -f docker-compose.yml down -v   # 테스트 볼륨만 삭제
node test/compose-e2e.mjs   # (임의 접미사의 프로젝트·볼륨 이름을 스스로 만들고, 해석된 설정이 그 이름만 쓰는지 확인한 뒤에만 실행) 컨테이너를 띄워 Seccomp:2, 회원 키(401), 서버 SIGKILL 후 재시작·deny-list를 확인
node --test test/*.test.mjs # compose.test.mjs는 `docker compose config`로 설정 계약을 검사
```

`compose-e2e.mjs`는 서버 프로세스를 `SIGKILL`로 죽입니다(`docker kill`은 수동 중지로 취급되어 restart 정책이 적용되지 않으므로 쓰지 않음). 이미지 크기는 약 314 MB(`docker image inspect`), setuid/setgid 파일은 빌드 중 모두 삭제합니다. `test/`는 이 이미지 안에서 검증하려고 일부러 이미지에 포함합니다.

실측(Docker Desktop, 위 제한): C hello 약 40 ms, Python 약 25 ms, Java hello 약 300–370 ms / Scanner 약 450–580 ms(첫 실행 포함, `timeMs`는 대기열·마지막 정리 제외). 컨테이너 cgroup 최대 메모리: C/Python 약 20 MiB, Java 약 55 MiB(서버 포함). 이미지의 Debian 패키지 버전은 `/opt/runner/apt-versions.txt`에 기록됩니다.
