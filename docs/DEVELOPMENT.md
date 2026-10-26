# 개발 가이드

COM's 웹사이트를 로컬에서 실행하고, 테스트하고, 배포하는 방법을 정리한 문서입니다.
프로젝트 소개는 [README](../README.md)를 참고하세요.

- [프로젝트 구조](#프로젝트-구조)
- [로컬에서 실행하기](#로컬에서-실행하기)
- [테스트와 빌드](#테스트와-빌드)
- [Docker로 실행하기](#docker로-실행하기)
- [주요 API](#주요-api)
- [환경 변수](#환경-변수)
- [배포](#배포)
- [운영 메모](#운영-메모)

## 프로젝트 구조

```text
coms-website/
├── src/                          # React 프론트엔드 (TypeScript)
│   ├── pages/                    # 화면 단위 컴포넌트 (admin/, community/, home/ 포함)
│   ├── features/                 # 활동 기록·캘린더·이벤트처럼 여러 화면이 쓰는 기능 묶음
│   ├── components/               # 공통 컴포넌트, 리치 에디터, 자료실 컴포넌트
│   ├── routes/                   # 라우트 가드, 페이지 제목, 래퍼
│   ├── services/                 # API 요청 모듈, 웹 푸시
│   ├── contexts/ hooks/ utils/   # 인증 컨텍스트, 공용 훅, 유틸리티
│   └── assets/ styles/           # 이미지, 로고, 폰트, 스타일
├── backend/                      # Spring Boot 백엔드 (Java 21)
│   └── src/main/
│       ├── java/com/coms/backend/
│       │   ├── controller/       # REST API
│       │   ├── service/          # 비즈니스 로직
│       │   ├── repository/       # JPA Repository
│       │   ├── domain/           # Entity
│       │   ├── dto/              # Request/Response DTO
│       │   ├── security/         # JWT, 인증 필터
│       │   └── config/           # 보안, 시간, Flyway 설정
│       └── resources/db/migration/   # Flyway migration
├── tests/                        # 프론트엔드 단위 테스트(*.test.mjs)와 Playwright E2E(e2e/)
├── public/                       # 정적 파일, PWA manifest, 서비스 워커 푸시 핸들러
├── scripts/                      # 테스트 실행기, 운영 스모크 테스트, Windows 보조 스크립트
├── docs/                         # 문서, 설계 메모, README 이미지
├── docker-compose.yml
├── Dockerfile.frontend
└── nginx.frontend.conf
```

## 로컬에서 실행하기

### 1. 저장소 클론

```bash
git clone https://github.com/kw-coms/coms-website.git
cd coms-website
```

### 2. 환경 변수 설정

```powershell
Copy-Item .env.example .env
```

운영 환경에서는 `.env`의 `JWT_SECRET`, `DB_PASSWORD`, `CORS_ALLOWED_ORIGINS`, SMTP 관련 값을 반드시 실제 값으로 변경해야 합니다. `CORS_ALLOWED_ORIGINS`에는 실제로 사용하는 HTTPS 웹 출처와 모바일 앱 출처만 넣으세요.

새 운영 DB에는 기본 관리자나 실제 회원 명부가 생성되지 않습니다. 첫 관리자는 32자 이상의 무작위 `BOOTSTRAP_SECRET`을 서버의 `.env`에 설정한 뒤 `/api/maintenance/bootstrap`으로 한 번만 등록합니다. 등록 후 이 값을 `.env`에서 제거하고 백엔드를 다시 시작하세요. 기존 운영 DB에는 이 초기 설정이 다시 적용되지 않습니다.

### 3. 백엔드 실행

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE = "dev"
$env:JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
.\gradlew.bat bootRun
```

개발 프로필은 H2 파일 DB를 사용합니다. 서버는 기본적으로 `http://localhost:8080`에서 실행됩니다. 개발용 관리자 계정이 필요하면 실행 전에 `COMS_DEV_ADMIN_PASSWORD`에 12자 이상의 임의 비밀번호를 설정하세요. 소스에 고정 비밀번호는 없습니다.

JDK 21을 `JAVA_HOME`으로 지정했거나 스크립트가 인식하는 로컬 경로에 설치했다면 루트에서 다음 스크립트를 사용할 수 있습니다.

```powershell
.\scripts\start-backend.ps1
```

### 4. 프론트엔드 실행

새 터미널에서 실행합니다.

```powershell
npm ci
npm run dev
```

프론트엔드는 `http://localhost:3000`에서 실행됩니다. Vite 개발 서버는 `/api` 요청을 `http://localhost:8080`으로 프록시합니다.

## 테스트와 빌드

### Frontend

| 명령 | 하는 일 |
| --- | --- |
| `npm test` | 타입 검사 + ESLint + 단위 테스트 |
| `npm run build` | 운영 빌드 |
| `npm run e2e` | 빌드 후 Playwright E2E (스모크, 접근성, 시각 회귀 포함) |
| `npm run e2e:update` | 시각 회귀 스냅샷 갱신 |
| `npm run test:e2e:backend` | 실제 백엔드를 띄워 로그인 흐름까지 검증 |
| `npm run smoke:production` | 운영 사이트 스모크 테스트 |

### Backend

```powershell
cd backend
.\gradlew.bat test
```

또는 루트에서 다음 스크립트를 사용할 수 있습니다.

```powershell
.\scripts\test-backend.ps1
```

## Docker로 실행하기

```powershell
docker compose --env-file .env up -d --build
```

기본 포트는 다음과 같습니다.

| 서비스 | 주소 |
| --- | --- |
| Frontend | `http://127.0.0.1:3000` |
| Backend | `http://127.0.0.1:8080` |
| Health Check | `http://127.0.0.1:8080/actuator/health` |

프론트엔드 Docker 빌드는 Vite 빌드 시점의 `.env` 값을 사용합니다. 로컬 Docker에서 프론트엔드가 백엔드에 직접 접근해야 한다면 `VITE_API_BASE_URL=http://localhost:8080/api`처럼 설정한 뒤 다시 빌드하세요. 운영 환경에서는 보통 reverse proxy가 `/api`를 백엔드로 전달하도록 구성합니다.

## 주요 API

전체 명세는 백엔드가 생성하는 OpenAPI 문서를 참고하세요. CI의 `OpenAPI Drift Check`가 명세와 코드가 어긋나지 않았는지 확인합니다.

| 영역 | 경로 | 권한 |
| --- | --- | --- |
| 인증 | `/api/auth/**` | 일부 공개, 일부 회원 |
| 모집 지원 | `POST /api/recruit/apply` | 공개 |
| 공지사항 조회 | `GET /api/notices/**` | 회원 |
| 공지사항 관리 | `POST`, `PUT`, `DELETE /api/notices/**` | 작성 권한 보유 회원 또는 작성자(동작별 상이) |
| 자료실 | `/api/files/**` | 회원 |
| 커뮤니티 | `/api/community/posts/**` | 회원 |
| 커뮤니티 공유 링크 | `GET /api/community/posts/{id}/share-link` | 회원 (글을 읽을 수 있는 회원에게 서명된 링크) |
| 커뮤니티 링크 미리보기 | `GET /api/community/posts/{id}/share`, `GET /api/community/posts/{id}/share-data`, `GET /api/community/posts/{id}/share-image` | 공개 (`?s=` 서명이 있을 때만 글 미리보기, 없으면 일반 카드·이미지 404) |
| 알림 | `/api/notifications/**` | 회원 |
| COM's Apps | `GET /api/club-projects/**` | 공개 |
| 폰트 조회 | `GET /api/fonts/**` | 공개 |
| 모바일 앱 | `/api/mobile/v1/**` | 회원 |
| 관리자 | `/api/admin/**` | 관리자 |
| 상태 확인 | `/actuator/health`, `/actuator/info` | 공개 |

로그인이 없거나 만료·폐기된 요청은 **401**, 로그인했지만 권한이 없는 요청은 **403**을 받습니다. 웹과 모바일 앱은 401일 때만 토큰을 새로 받습니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | 프론트엔드 API base URL |
| `PUBLIC_BASE_URL` | 공유 미리보기용 공개 사이트 URL |
| `SPRING_PROFILES_ACTIVE` | Spring profile |
| `JWT_SECRET` | JWT 서명 secret |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | DB 접속 정보 |
| `DB_USER`, `DB_PASSWORD` | DB 계정 |
| `COOKIE_SECURE` | HTTPS 쿠키 보안 옵션 |
| `COOKIE_SAME_SITE` | 쿠키 SameSite 정책 (`Lax` 기본값; 모바일 앱 연동 시 `None` 필요) |
| `CORS_ALLOWED_ORIGINS` | 허용할 origin 목록 |
| `AUTH_TRUSTED_PROXY_IPS` | 백엔드가 `X-Real-IP`를 신뢰할 바로 앞 리버스 프록시의 숫자 IP 목록. 운영 Docker 네트워크의 게이트웨이 IP를 지정해야 로그인·지원 조회 횟수 제한이 방문자별로 적용됩니다. |
| `MAIL_ENABLED` | 메일 발송 사용 여부 |
| `MAIL_LOG_VERIFICATION_CODES` | 인증 코드 로그 출력 여부 |
| `MAIL_FROM`, `RECRUIT_MAIL_TO` | 발신/수신 메일 주소 |
| `SMTP_HOST`, `SMTP_PORT` | SMTP 서버 |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP 계정 |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | JPA DDL 옵션 |
| `H2_CONSOLE_ENABLED` | H2 console 사용 여부 |
| `BOOTSTRAP_SECRET` | bootstrap API 보호용 secret |
| `COMS_BACKUP_DIR` | DB·업로드 백업을 쌓을 서버 폴더. 기본값 `../coms-backups` (저장소 폴더 옆) |
| `BACKUP_KEEP_DAYS` | 매일 백업 보관 일수. 기본값 14 |

전체 목록과 기본값은 [`.env.example`](../.env.example)에 있습니다.

### 백엔드 설정값 (기본값으로 충분할 때가 많습니다)

아래 값은 `docker-compose.yml`의 `coms-backend.environment`에 넘겨줄 때만 적용됩니다. `.env`에 적기만 해서는 컨테이너에 전달되지 않습니다.

| 설정 | 환경 변수 이름 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `storage.min-free-bytes` | `STORAGE_MIN_FREE_BYTES` | 524288000 (500MB) | 업로드 디스크의 여유 공간이 이보다 적으면 업로드를 거절(507) |
| `coms.retention.audit-ip-days` | `COMS_RETENTION_AUDIT_IP_DAYS` | 180 | 감사 로그의 IP를 지우는 기간 |
| `coms.retention.recruit-application-ip-days` | `COMS_RETENTION_RECRUIT_APPLICATION_IP_DAYS` | 30 | 지원서 접속 IP를 지우는 기간 |
| `coms.retention.recruit-application-days` | `COMS_RETENTION_RECRUIT_APPLICATION_DAYS` | 365 | 처리하지 않은 지원서를 지우는 기간 |
| `coms.retention.recruit-decision-contact-days` | `COMS_RETENTION_RECRUIT_DECISION_CONTACT_DAYS` | 365 | 합격·불합격 기록에서 전화번호·이메일을 지우는 기간 |

## 배포

`main` 브랜치에 push한 뒤 CI가 성공하거나 GitHub Actions에서 검증된 커밋을 수동 지정하면 `.github/workflows/deploy.yml`이 서버에 접속해 Docker Compose로 서비스를 배포합니다.

필요한 GitHub Secrets:

| Secret | 필수 | 설명 |
| --- | --- | --- |
| `DEPLOY_HOST` | ✅ | 배포 서버 주소 |
| `DEPLOY_USER` | ✅ | SSH 사용자 |
| `DEPLOY_PORT` | ✅ | SSH 포트 |
| `DEPLOY_SSH_KEY` | ✅ | SSH 개인 키 |
| `DEPLOY_SSH_KNOWN_HOSTS` | ✅ | 서버 호스트 키 (엄격 검증용) |
| `DEPLOY_PATH` | 선택 | 서버의 배포 경로. 없으면 `~/apps/coms-website` |
| `PUBLIC_BASE_URL` | 선택 | 공개 사이트 주소. 없으면 `https://coms.kw.ac.kr` |

서버에는 `git`, Docker, Docker Compose가 설치되어 있어야 하며, 최초 배포 전 `DEPLOY_PATH/.env` 파일을 준비해야 합니다.

## 운영 메모

- 운영에서는 `JWT_SECRET`과 `DB_PASSWORD`를 기본값으로 두지 않습니다.
- 운영에서는 `COOKIE_SECURE=true`를 유지합니다.
- **Capacitor 모바일 앱 연동 시**: `COOKIE_SAME_SITE=None`과 `COOKIE_SECURE=true`를 설정하고, `CORS_ALLOWED_ORIGINS`에 `https://localhost`(Android)와 `capacitor://localhost`(iOS)를 추가해야 합니다. `SameSite=None`은 반드시 HTTPS(Secure=true)와 함께 사용해야 합니다.
- 운영에서는 `MAIL_LOG_VERIFICATION_CODES=false`를 유지합니다.
- 메일 기능을 사용할 때만 서버의 `.env`에 `RECRUIT_MAIL_TO`를 설정합니다.
- PostgreSQL 스키마는 Flyway migration으로 관리합니다.
- 기존 운영 DB에 공개 자격 증명·학번을 제거한 migration 파일을 처음 배포할 때는 DB를 백업한 뒤 Flyway 11.14.1로 `repair`와 `validate`를 수행해야 합니다. 기존 데이터는 삭제되지 않습니다.
- 운영 reverse proxy는 `/api`와 `/actuator` 요청을 백엔드로 전달해야 합니다.
- DB와 업로드 파일은 `db-backup` 서비스가 매일, 배포 스크립트가 배포 직전에 백업합니다. 백업 폴더(`COMS_BACKUP_DIR`)는 정기적으로 서버 밖으로 복사하세요. 복원 방법은 [백업과 되돌리기](operations/backup-and-rollback.md)에 있습니다.
- 배포한 새 버전이 헬스 체크에 실패하면 직전 이미지로 자동으로 되돌아갑니다.
