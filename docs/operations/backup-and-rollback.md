# 백업과 되돌리기

운영 서버의 데이터베이스 백업이 어디에 쌓이는지, 배포가 실패하면 무슨 일이 일어나는지, 손으로 복원하는 방법을 정리한 문서입니다.

## 백업은 언제, 어디에 생기나요

| 종류 | 언제 | 파일 이름 | 보관 |
| --- | --- | --- | --- |
| 매일 백업 | `db-backup` 서비스가 켜질 때 한 번, 그 뒤로 24시간마다 | `daily-YYYYMMDDTHHMMSS.dump` | 14일 (`BACKUP_KEEP_DAYS`) |
| 배포 직전 백업 | 배포할 때마다, 새 버전이 DB 마이그레이션을 돌리기 전 | `predeploy-YYYYMMDDTHHMMSS-<커밋>.dump` | 최근 10개 |
| 업로드 파일 | 매일 백업과 함께. 단, 디스크 여유가 업로드 용량의 3배 이상일 때만 | `uploads-YYYYMMDDTHHMMSS.tar.gz` | 최근 2개 |

- 위치는 기본적으로 저장소 폴더 **옆의** `coms-backups/`입니다. 예를 들어 배포 경로가 `~/apps/coms-website`라면 `~/apps/coms-backups/`입니다.
- 위치를 바꾸려면 서버의 `.env`에 `COMS_BACKUP_DIR`을 설정합니다.
- 배포 스크립트의 `git clean`은 저장소 폴더 안만 지우기 때문에, 저장소 밖에 있는 백업은 지워지지 않습니다.
- 파일은 `pg_dump`의 custom 형식이라 압축되어 있고, `pg_restore`로 복원합니다.
- 회원 개인정보가 들어 있어서 폴더와 파일 모두 소유자만 읽을 수 있습니다(700/600).
- 배포 직전 백업이 실패하면 **배포를 멈춥니다**. 백업 없이 마이그레이션을 돌리지 않기 위해서입니다.

> ⚠️ 같은 디스크에 있는 백업은 디스크가 망가지면 같이 사라집니다. `coms-backups/`를 주기적으로 서버 밖으로 복사하세요.
>
> ```bash
> # 예: 내 PC에서 서버 백업을 받아오기
> rsync -av --chmod=F600 <배포계정>@<서버>:~/apps/coms-backups/ ./coms-backups/
> ```

## 배포가 실패하면

배포 스크립트(`.github/workflows/deploy.yml`)는 이렇게 동작합니다.

1. 지금 돌고 있는 백엔드와 프론트엔드 이미지에 `previous` 태그를 붙여 둡니다.
2. 새 이미지를 `coms-backend:<커밋>`, `coms-frontend:<커밋>`으로 빌드하고 컨테이너를 교체합니다.
3. 백엔드 헬스 체크를 최대 3분, 공개 주소를 최대 1분 기다립니다.
4. 결과에 따라 나뉩니다.
   - **성공하면** 새 이미지를 `latest`로 표시하고, 현재와 직전 이미지만 남기고 나머지는 지웁니다.
   - **실패하면** `previous` 이미지로 바로 되돌리고 다시 헬스 체크를 합니다. 되돌리기에 성공해도 배포 작업은 실패(빨간색)로 남으니, 원인을 고친 뒤 다시 배포하세요.

컨테이너 로그는 공개 저장소의 작업 기록에 남기지 않습니다. 대신 서버의 `~/deploy-logs/`에 저장하고 30일 뒤 지웁니다.

## 손으로 이전 버전으로 되돌리기

자동 되돌리기가 실패했거나, 배포는 성공했는데 나중에 문제가 발견된 경우입니다.

```bash
cd ~/apps/coms-website

# 남아 있는 이미지 확인 (현재, previous, latest)
docker image ls coms-backend
docker image ls coms-frontend

# 직전 버전으로 되돌리기
docker tag coms-backend:previous coms-backend:latest
docker tag coms-frontend:previous coms-frontend:latest
COMS_IMAGE_TAG=previous docker compose --env-file .env up -d --no-build coms-backend coms-frontend
curl -fsS http://127.0.0.1:8080/actuator/health
```

새 버전이 추가한 DB 마이그레이션은 되돌려지지 않습니다. 대부분의 마이그레이션은 컬럼과 테이블을 추가하기만 해서 이전 버전도 그대로 동작합니다. 그렇지 않은 경우에는 아래처럼 DB를 복원하세요.

## 데이터베이스 복원

> 복원하면 지금 DB 내용이 백업 시점으로 **덮어써집니다**. 복원 전에 지금 상태도 한 번 더 백업해 두세요.

```bash
cd ~/apps/coms-website
BACKUPS=../coms-backups

# 1. 복원할 파일 고르기 (최신 순)
ls -lt "$BACKUPS"

# 2. 지금 상태도 백업
docker compose --env-file .env exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$BACKUPS/before-restore-$(date +%Y%m%dT%H%M%S).dump"

# 3. 백엔드를 멈춰서 복원 중에 쓰기가 일어나지 않게 하기
docker compose --env-file .env stop coms-backend

# 4. 복원 (기존 객체를 지우고 백업 내용으로 다시 만듦)
docker compose --env-file .env exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$BACKUPS/daily-20261026T030000.dump"

# 5. 백엔드 다시 시작하고 확인
docker compose --env-file .env start coms-backend
curl -fsS http://127.0.0.1:8080/actuator/health
```

복원 파일이 정상인지 미리 확인만 하려면 목록을 출력해 봅니다.

```bash
docker compose --env-file .env exec -T db pg_restore --list < "$BACKUPS/daily-20261026T030000.dump" | head
```

## 업로드 파일

게시글 이미지와 자료실 파일은 DB가 아니라 Docker 볼륨(`backend-uploads`)에 있습니다.

- `db-backup` 서비스가 매일 `uploads-*.tar.gz`로 압축해 둡니다.
- 디스크가 가득 차면 사이트가 멈추기 때문에, 여유 공간이 부족한 날은 건너뛰고 로그에 남깁니다. 로그는 `docker compose logs db-backup`으로 봅니다.

복원은 백엔드를 멈춘 뒤 압축을 풉니다.

```bash
docker compose --env-file .env stop coms-backend
docker run --rm -v coms-website_backend-uploads:/data -v "$PWD/../coms-backups":/in:ro alpine \
  sh -c 'tar xzf /in/uploads-20261026T030000.tar.gz -C /data'
docker compose --env-file .env start coms-backend
```

볼륨 이름은 `docker volume ls`로 확인합니다. 보통 `<저장소 폴더 이름>_backend-uploads`입니다.
