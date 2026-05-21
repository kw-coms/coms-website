# COM's Website

광운대학교 중앙 컴퓨터 학술동아리 **COM's**의 공식 웹사이트입니다.

동아리 소개, 모집 안내, 공지사항, 자료실, 커뮤니티, 회원 관리 기능을 제공하며, React 프론트엔드와 Spring Boot 백엔드를 한 저장소에서 함께 관리합니다.

![COM's Logo](public/coms-logo.png)

## 주요 기능

- 동아리 소개, 활동, 프로젝트, 모집 안내
- 회원가입, 로그인, 로그아웃, 비밀번호 변경/재설정
- 가입 가능 명부 기반 회원가입 및 이메일 인증
- 공지사항 조회, 작성, 수정, 삭제
- 회원 전용 자료실 파일 업로드/다운로드
- 회원 전용 커뮤니티 게시글, 이미지, 댓글, 추천/비추천
- 모집 지원서 제출 및 메일 알림
- 관리자 회원 관리, 권한 관리, 차단 학생 관리
- 사이트 폰트 업로드 및 활성화

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7, Tailwind CSS 4 |
| Backend | Java 21, Spring Boot 4, Gradle |
| Security | Spring Security, JWT, HttpOnly Cookie, BCrypt |
| Database | H2, PostgreSQL, Flyway |
| Infra | Docker, Docker Compose, Nginx, GitHub Actions |

## 프로젝트 구조

```text
coms-website/
|-- src/                         # React frontend
|   |-- assets/                   # 이미지, 로고, 폰트
|   |-- components/               # 공통 컴포넌트
|   |-- contexts/                 # 인증 컨텍스트
|   |-- pages/                    # 화면 단위 컴포넌트
|   `-- services/                 # API 요청 모듈
|-- public/                      # 정적 파일
|-- backend/                     # Spring Boot backend
|   |-- src/main/java/com/coms/backend/
|   |   |-- controller/           # REST API
|   |   |-- service/              # 비즈니스 로직
|   |   |-- repository/           # JPA Repository
|   |   |-- domain/               # Entity
|   |   |-- dto/                  # Request/Response DTO
|   |   |-- security/             # JWT, 인증 필터
|   |   `-- config/               # 보안, 시간, Flyway 설정
|   `-- src/main/resources/
|       `-- db/migration/         # Flyway migration
|-- scripts/                     # Windows 보조 스크립트
|-- docker-compose.yml
|-- Dockerfile.frontend
`-- nginx.frontend.conf
```

## 시작하기

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

```powershell
npm run lint
npm run build
```

### Backend

```powershell
cd backend
.\gradlew.bat test
```

또는 루트에서 다음 스크립트를 사용할 수 있습니다.

```powershell
.\scripts\test-backend.ps1
```

## Docker 실행

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

| 영역 | 경로 | 권한 |
| --- | --- | --- |
| 인증 | `/api/auth/**` | 일부 공개, 일부 회원 |
| 모집 지원 | `POST /api/recruit/apply` | 공개 |
| 공지사항 조회 | `GET /api/notices/**` | 회원 |
| 공지사항 관리 | `POST`, `PUT`, `DELETE /api/notices/**` | 작성 권한 보유 회원 또는 작성자(동작별 상이) |
| 자료실 | `/api/files/**` | 회원 |
| 커뮤니티 | `/api/community/posts/**` | 회원 |
| 커뮤니티 링크 미리보기 | `GET /api/community/posts/{id}/share`, `GET /api/community/posts/{id}/share-data`, `GET /api/community/posts/{id}/share-image` | 공개 |
| 알림 | `/api/notifications/**` | 회원 |
| 폰트 조회 | `GET /api/fonts/**` | 공개 |
| 관리자 | `/api/admin/**` | 관리자 |
| 상태 확인 | `/actuator/health`, `/actuator/info` | 공개 |

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

## 배포

`main` 브랜치에 push한 뒤 CI가 성공하거나 GitHub Actions에서 검증된 커밋을 수동 지정하면 `.github/workflows/deploy.yml`이 서버에 접속해 Docker Compose로 서비스를 배포합니다.

필요한 GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PORT`
- `DEPLOY_SSH_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_PATH`
- `PUBLIC_BASE_URL`

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
- DB volume과 업로드 파일 volume은 정기적으로 백업합니다.
