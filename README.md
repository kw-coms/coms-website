# COM's Website

광운대학교 중앙 컴퓨터 동아리 **COM's**의 공식 웹사이트입니다. 동아리 소개, 모집 안내, 공지사항, 자료실, 커뮤니티, 회원/관리자 기능을 하나의 웹 서비스로 제공합니다.

이 저장소는 React 기반 프론트엔드와 Spring Boot 기반 백엔드를 함께 관리하는 모노레포입니다.

## 주요 기능

- 동아리 소개, 활동, 프로젝트, 모집 안내 페이지
- 회원가입, 로그인, 로그아웃, JWT 기반 인증
- 가입 전 이메일 인증, 가입 후 이메일 인증, 비밀번호 재설정
- 공지사항 조회 및 관리자 작성/수정/삭제
- 회원 전용 자료실 파일 업로드, 다운로드, 삭제
- 회원 전용 커뮤니티 게시글, 이미지, 댓글, 대댓글, 추천/비추천
- 모집 지원서 제출 및 메일 알림
- 알림 목록, 읽음 처리, 읽지 않은 알림 카운트
- 관리자 회원 관리, 권한 변경, 비밀번호 초기화
- 관리자 가입 가능 명부 관리, 명부 파일 가져오기, 차단 학생 관리
- 관리자 사이트 폰트 업로드 및 활성화

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 7, Tailwind CSS 4, lucide-react |
| Backend | Java 21, Spring Boot 4, Gradle, Spring Security, Spring Data JPA |
| Auth | JWT, HttpOnly Cookie, BCrypt |
| Database | H2(dev/test), PostgreSQL(prod), Flyway |
| Infra | Docker, Docker Compose, Nginx, GitHub Actions |
COM's Website는 동아리 소개, 활동 안내, 프로젝트 소개, 신입 부원 모집, 회원 관리, 커뮤니티, 자료실, 공지사항 기능을 제공하기 위해 개발 중인 웹 서비스입니다.

본 프로젝트는 외부 클라우드 서비스 의존을 최소화하고, **COM's 자체 인하우스 서버**에서 운영하는 것을 목표로 합니다.

---

## 프로젝트 소개

**COM's Website**는 광운대학교 중앙 컴퓨터 학술동아리 COM's의 공식 온라인 플랫폼입니다.

단순한 소개 페이지를 넘어, 동아리 운영에 필요한 회원 관리, 자료 공유, 커뮤니티, 공지사항, 모집 안내 기능까지 하나의 웹서비스로 제공하는 것을 목표로 합니다.

### 주요 목적

- COM's 동아리 소개
- 신입 부원 모집 안내
- 동아리 활동 및 프로젝트 소개
- 회원가입 / 로그인 / 로그아웃
- 회원 전용 커뮤니티 운영
- 회원 전용 자료실 제공
- 공지사항 관리
- 관리자 권한 기반 운영 관리
- 자체 인하우스 서버 기반 웹서비스 운영

---

## 주요 기능

### 기본 페이지

- 메인 페이지
- 동아리 소개 페이지
- 활동 소개 페이지
- 프로젝트 소개 페이지
- 모집 안내 페이지
- 모집 지원 페이지
- 공지사항 페이지
- 로그인 페이지
- 회원가입 페이지
- 비밀번호 변경 페이지
- 커뮤니티 페이지
- 자료실 페이지
- 관리자 페이지

### 회원 기능

- 회원가입
- 로그인
- 로그아웃
- 현재 로그인 사용자 정보 조회
- 비밀번호 변경
- 프로필 수정
- 이메일 인증
- 로그인 상태 기반 메뉴 분기
- 회원 전용 페이지 접근 제어
- JWT / Cookie 기반 인증 처리

### 공지사항 기능

- 공지사항 목록 조회
- 공지사항 상세 조회
- 공지사항 작성
- 공지사항 수정
- 공지사항 삭제
- 관리자 권한 기반 공지 관리

### 커뮤니티 기능

- 게시글 목록 조회
- 게시글 상세 조회
- 게시글 작성
- 게시글 수정
- 게시글 삭제
- 게시글 추천 / 비추천
- 이미지 첨부 게시글 작성
- 댓글 작성
- 대댓글 작성
- 댓글 삭제
- 회원 전용 게시판 운영

### 자료실 기능

- 로그인한 회원만 접근 가능
- 자료 목록 조회
- 파일 업로드
- 파일 다운로드
- 파일 삭제
- 강의 자료, 프로젝트 자료, 세미나 자료 공유
- 서버 로컬 스토리지 또는 추후 NAS 연동 가능

### 모집 기능

- 모집 안내 페이지
- 모집 지원서 제출
- 지원자 정보 백엔드 전송
- 지원서 제출 후 이메일 또는 관리자 확인 구조 확장 가능

### 관리자 기능

- 회원 목록 조회
- 회원 권한 변경
- 회원 삭제
- 회원 비밀번호 초기화
- 가입 가능 명단 조회
- 가입 가능 명단 추가
- 가입 가능 명단 수정
- 가입 가능 명단 삭제
- 가입 가능 명단 파일 업로드
- 차단 학번 관리
- 자료실 파일 관리
- 공지사항 관리
- 커뮤니티 관리 기능 확장 가능

### 알림 기능

- 알림 목록 조회
- 알림 요약 조회
- 개별 알림 읽음 처리
- 전체 알림 읽음 처리

---

## 기술 스택

### Frontend

| 구분 | 기술 |
|---|---|
| Framework | React |
| Build Tool | Vite |
| Language | JavaScript |
| Styling | Tailwind CSS |
| Icon | lucide-react |
| Routing | react-router-dom |
| Package Manager | npm |

### Backend

| 구분 | 기술 |
|---|---|
| Framework | Spring Boot |
| Language | Java 21 |
| Build Tool | Gradle |
| Security | Spring Security |
| Auth | JWT |
| ORM | Spring Data JPA |
| Validation | Spring Validation |
| Mail | Spring Mail |
| Migration | Flyway |
| Database - Dev | H2 Database |
| Database - Prod | PostgreSQL |
| Monitoring | Spring Boot Actuator |
| File Processing | Apache POI, Commons CSV |

### Infra / Deployment

| 구분 | 기술 |
|---|---|
| Server | COM's 자체 인하우스 서버 |
| OS | Ubuntu Server |
| Web Server | Nginx |
| Backend Runtime | Java 21 |
| Database | PostgreSQL |
| Container | Docker / Docker Compose |
| HTTPS | Let's Encrypt 권장 |
| Domain | coms.kw.ac.kr 또는 COM's 보유 도메인 |
| Collaboration | GitHub Issues / Pull Requests / Projects |

---

## 프로젝트 구조

```text
coms-website/
├─ src/                         # React frontend
│  ├─ components/               # 공통 컴포넌트
│  ├─ contexts/                 # 인증 컨텍스트
│  ├─ pages/                    # 라우트 단위 페이지
│  ├─ services/                 # API 클라이언트
│  └─ assets/                   # 이미지, 로고, 폰트
├─ public/                      # 정적 공개 자산
├─ backend/                     # Spring Boot backend
│  ├─ src/main/java/com/coms/backend/
│  │  ├─ controller/            # REST API 컨트롤러
│  │  ├─ service/               # 비즈니스 로직
│  │  ├─ repository/            # JPA repository
│  │  ├─ domain/                # JPA entity
│  │  ├─ dto/                   # 요청/응답 DTO
│  │  ├─ security/              # JWT, 인증 필터
│  │  └─ config/                # Security, Flyway, time config
│  └─ src/main/resources/
│     └─ db/migration/          # Flyway migration
├─ scripts/                     # Windows용 보조 스크립트
├─ docker-compose.yml
├─ Dockerfile.frontend
└─ nginx.frontend.conf
```

## 로컬 개발 환경

### 요구 사항

- Node.js 24 권장
- npm
- JDK 21
- Docker, Docker Compose 선택 사항

### 환경 변수 준비

```powershell
Copy-Item .env.example .env
```

로컬 개발에서는 기본적으로 Vite가 `/api` 요청을 `http://localhost:8080`으로 프록시합니다.

### 백엔드 실행

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE = "dev"
.\gradlew.bat bootRun
```

개발 프로필은 H2 파일 DB를 사용하며, `cookie.secure=false`, 개발용 JWT secret, `ddl-auto=update`가 적용됩니다.

로컬 JDK가 `.tools\jdk-21.0.11+10` 경로에 준비되어 있다면 보조 스크립트도 사용할 수 있습니다.

```powershell
.\scripts\start-backend.ps1
```

### 프론트엔드 실행

새 PowerShell 창에서 실행합니다.

```powershell
npm install
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Health check: `http://localhost:8080/actuator/health`

## 테스트와 빌드

```powershell
npm run lint
npm run build
```

```powershell
cd backend
.\gradlew.bat test
```

로컬 JDK 보조 경로를 사용하는 경우:

```powershell
.\scripts\test-backend.ps1
```

## Docker 실행

`.env`에서 최소한 `DB_PASSWORD`와 32자 이상의 `JWT_SECRET`을 운영 환경에 맞게 변경한 뒤 실행합니다.

```powershell
docker compose --env-file .env up -d --build
```

기본 포트는 다음과 같습니다.

- Frontend container: `127.0.0.1:3000`
- Backend container: `127.0.0.1:8080`
- PostgreSQL: compose 내부 네트워크에서만 사용

운영 배포에서는 외부 reverse proxy가 `/`는 프론트엔드로, `/api`와 `/actuator`는 백엔드로 전달하도록 구성해야 합니다.

## 주요 API

| 영역 | 경로 | 접근 |
| --- | --- | --- |
| 인증 | `/api/auth/**` | 로그인/가입 일부 공개, 나머지 인증 필요 |
| 모집 | `POST /api/recruit/apply` | 공개 |
| 공지사항 | `GET /api/notices`, `GET /api/notices/{id}` | 공개 |
| 공지사항 관리 | `POST/PUT/DELETE /api/notices/**` | 관리자 |
| 자료실 | `/api/files/**` | 회원 |
| 커뮤니티 | `/api/community/posts/**` | 회원 |
| 알림 | `/api/notifications/**` | 회원 |
| 폰트 조회 | `GET /api/fonts/**` | 공개 |
| 관리자 | `/api/admin/**` | 관리자 |
| 점검/부트스트랩 | `/api/maintenance/**` | 관리자, bootstrap 일부 공개 secret 필요 |
| 상태 확인 | `/actuator/health`, `/actuator/info` | 공개 |

## 주요 환경 변수

| 변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | 프론트엔드 API base URL. 로컬 기본값은 `/api` |
| `SPRING_PROFILES_ACTIVE` | `dev`, `prod`, `test` 등 Spring profile |
| `JWT_SECRET` | JWT 서명 secret. 운영에서는 32자 이상 권장 |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | PostgreSQL 접속 정보 |
| `DB_USER`, `DB_PASSWORD` | PostgreSQL 계정 정보 |
| `COOKIE_SECURE` | HTTPS 환경 쿠키 보안 옵션. 운영은 `true` 권장 |
| `CORS_ALLOWED_ORIGINS` | 허용할 프론트엔드 origin 목록 |
| `MAIL_ENABLED` | 메일 발송 사용 여부 |
| `MAIL_LOG_VERIFICATION_CODES` | 인증 코드를 로그에 남길지 여부. 운영은 `false` |
| `MAIL_FROM`, `RECRUIT_MAIL_TO` | 발신 주소와 모집 지원서 수신 주소 |
| `SMTP_HOST`, `SMTP_PORT` | SMTP 서버 정보 |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP 인증 정보 |
| `SMTP_AUTH`, `SMTP_STARTTLS` | SMTP 인증/TLS 옵션 |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | 운영 기본값은 `validate`, 초기 배포 시에만 신중하게 변경 |
| `H2_CONSOLE_ENABLED` | H2 console 활성화. 개발 환경에서만 사용 |
| `BOOTSTRAP_SECRET` | maintenance bootstrap 요청 보호용 secret |

## 배포

`.github/workflows/deploy.yml`은 `main` 브랜치 push 또는 수동 실행으로 서버에 배포합니다.

GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PORT` 선택, 기본값 `22`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH` 선택, 기본값 `~/apps/coms-website`
- `PUBLIC_BASE_URL` 선택, 기본값 `https://coms.kw.ac.kr`

서버에는 `git`, Docker, Docker Compose가 필요합니다. 최초 배포 전 `DEPLOY_PATH/.env`를 `.env.example` 기준으로 생성하고 운영 값으로 채워야 합니다.

배포 워크플로는 서버에서 저장소를 갱신한 뒤 다음 명령을 실행합니다.

```bash
docker compose --env-file .env -f docker-compose.yml up -d --build --remove-orphans
```

그 다음 백엔드 health check와 공개 URL의 `/api/server/time` 응답을 확인합니다.

## 데이터와 파일 저장소

- 개발 기본값은 H2 파일 DB입니다.
- 운영 프로필은 PostgreSQL과 Flyway migration을 사용합니다.
- Docker Compose에서는 DB 데이터가 `pgdata` volume에 저장됩니다.
- 백엔드 업로드 파일은 `backend-uploads` volume에 저장됩니다.
- 로컬 파일 기반 DB/스토리지는 `./backend-data`, `./uploads` 또는 실행 위치 기준 `./data`를 사용할 수 있습니다.

## 운영 체크리스트

- `JWT_SECRET`을 충분히 긴 랜덤 문자열로 설정
- `DB_PASSWORD`를 기본값이 아닌 값으로 설정
- 운영 도메인을 `CORS_ALLOWED_ORIGINS`에 추가
- HTTPS 환경에서 `COOKIE_SECURE=true` 유지
- 운영에서는 `MAIL_LOG_VERIFICATION_CODES=false` 유지
- 운영 reverse proxy에서 `/api`, `/actuator` 경로를 백엔드로 전달
- Flyway migration 적용 후 `SPRING_JPA_HIBERNATE_DDL_AUTO=validate` 유지
coms-website
├── .github
│   └── workflows
├── backend
│   ├── gradle
│   │   └── wrapper
│   ├── src
│   │   ├── main
│   │   │   ├── java
│   │   │   │   └── com
│   │   │   │       └── coms
│   │   │   │           └── backend
│   │   │   │               ├── config
│   │   │   │               ├── controller
│   │   │   │               ├── domain
│   │   │   │               ├── dto
│   │   │   │               ├── repository
│   │   │   │               ├── security
│   │   │   │               ├── service
│   │   │   │               └── BackendApplication.java
│   │   │   └── resources
│   │   │       ├── db
│   │   │       │   └── migration
│   │   │       ├── application.properties
│   │   │       ├── application-dev.properties
│   │   │       └── application-prod.properties
│   │   └── test
│   ├── Dockerfile
│   ├── build.gradle
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   └── settings.gradle
├── public
├── scripts
├── src
│   ├── assets
│   ├── components
│   │   ├── archive
│   │   ├── auth
│   │   ├── common
│   │   ├── home
│   │   └── layout
│   ├── contexts
│   │   ├── AuthContext.jsx
│   │   └── useAuth.js
│   ├── data
│   ├── hooks
│   ├── pages
│   │   ├── Admin.jsx
│   │   ├── Archive.jsx
│   │   ├── ChangePassword.jsx
│   │   ├── Community.jsx
│   │   ├── Login.jsx
│   │   ├── Notices.jsx
│   │   ├── RecruitApply.jsx
│   │   ├── RecruitNotice.jsx
│   │   └── Signup.jsx
│   ├── routes
│   ├── services
│   │   ├── adminApi.js
│   │   ├── apiClient.js
│   │   ├── archiveApi.js
│   │   ├── authApi.js
│   │   ├── communityApi.js
│   │   ├── fontApi.js
│   │   ├── noticeApi.js
│   │   ├── notificationApi.js
│   │   └── recruitApi.js
│   ├── styles
│   ├── utils
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .env.example
├── .gitignore
├── Dockerfile.frontend
├── docker-compose.yml
├── eslint.config.js
├── index.html
├── nginx.frontend.conf
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
