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

운영 환경에서는 `.env`의 `JWT_SECRET`, `DB_PASSWORD`, `CORS_ALLOWED_ORIGINS`, SMTP 관련 값을 반드시 실제 값으로 변경해야 합니다.

### 3. 백엔드 실행

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE = "dev"
.\gradlew.bat bootRun
```

개발 프로필은 H2 파일 DB를 사용합니다. 서버는 기본적으로 `http://localhost:8080`에서 실행됩니다.

로컬 JDK가 `.tools\jdk-21.0.11+10`에 준비되어 있다면 루트에서 다음 스크립트를 사용할 수 있습니다.

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
| 공지사항 조회 | `GET /api/notices/**` | 공개 |
| 공지사항 관리 | `POST`, `PUT`, `DELETE /api/notices/**` | 관리자 |
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
| `CORS_ALLOWED_ORIGINS` | 허용할 origin 목록 |
| `MAIL_ENABLED` | 메일 발송 사용 여부 |
| `MAIL_LOG_VERIFICATION_CODES` | 인증 코드 로그 출력 여부 |
| `MAIL_FROM`, `RECRUIT_MAIL_TO` | 발신/수신 메일 주소 |
| `SMTP_HOST`, `SMTP_PORT` | SMTP 서버 |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP 계정 |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | JPA DDL 옵션 |
| `H2_CONSOLE_ENABLED` | H2 console 사용 여부 |
| `BOOTSTRAP_SECRET` | bootstrap API 보호용 secret |

## 배포

`main` 브랜치에 push하거나 GitHub Actions에서 수동 실행하면 `.github/workflows/deploy.yml`이 서버에 접속해 Docker Compose로 서비스를 배포합니다.

필요한 GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PORT`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `PUBLIC_BASE_URL`

서버에는 `git`, Docker, Docker Compose가 설치되어 있어야 하며, 최초 배포 전 `DEPLOY_PATH/.env` 파일을 준비해야 합니다.

## 운영 메모

- 운영에서는 `JWT_SECRET`과 `DB_PASSWORD`를 기본값으로 두지 않습니다.
- 운영에서는 `COOKIE_SECURE=true`를 유지합니다.
- 운영에서는 `MAIL_LOG_VERIFICATION_CODES=false`를 유지합니다.
- PostgreSQL 스키마는 Flyway migration으로 관리합니다.
- 운영 reverse proxy는 `/api`와 `/actuator` 요청을 백엔드로 전달해야 합니다.
- DB volume과 업로드 파일 volume은 정기적으로 백업합니다.
