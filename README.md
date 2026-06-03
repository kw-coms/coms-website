# COM's Website

광운대학교 중앙 컴퓨터 학술동아리 **COM's**의 공식 웹사이트 프로젝트입니다.

COM's Website는 동아리 소개, 활동 안내, 프로젝트 소개, 신입 부원 모집, 회원 관리, 커뮤니티, 자료실 기능을 제공하기 위해 개발 중인 웹 서비스입니다.

본 프로젝트는 외부 클라우드 서비스가 아닌 **COM's 자체 인하우스 서버**에서 운영하는 것을 목표로 합니다.

---

## 프로젝트 소개

**COM's Website**는 광운대학교 중앙 컴퓨터 학술동아리 COM's의 공식 온라인 플랫폼입니다.

단순한 동아리 소개 페이지를 넘어, 동아리 운영에 필요한 회원 관리, 자료 공유, 커뮤니티, 공지 관리 기능까지 확장할 수 있도록 설계되었습니다.

주요 목적은 다음과 같습니다.

* COM's 동아리 소개
* 신입 부원 모집 안내
* 동아리 활동 및 프로젝트 소개
* 로그인 및 회원 관리
* 회원 전용 커뮤니티 운영
* 회원 전용 자료실 제공
* 관리자 권한 기반 운영 관리
* 자체 인하우스 서버 기반 웹서비스 운영

---

## 주요 기능

현재 구현 중이거나 추후 확장 예정인 기능은 다음과 같습니다.

### 기본 페이지

* 메인 페이지
* 동아리 소개 페이지
* 활동 소개 페이지
* 프로젝트 소개 페이지
* 모집 안내 페이지
* 문의 안내 페이지

### 회원 기능

* 회원가입
* 로그인
* 로그아웃
* 현재 로그인 사용자 정보 조회
* 회원 전용 페이지 접근 제어
* 관리자 권한 관리
* JWT 기반 인증

### 커뮤니티 기능

* 게시글 목록 조회
* 게시글 작성
* 게시글 삭제
* 회원 전용 게시판
* 추후 댓글 및 게시글 수정 기능 확장 예정

### 자료실 기능

* 로그인한 회원만 접근 가능
* 자료 목록 조회
* 파일 업로드
* 파일 다운로드
* 파일 삭제
* 강의 자료, 프로젝트 자료, 세미나 자료 공유
* 서버 로컬 스토리지 또는 추후 NAS 연동 예정

### 관리자 기능

* 회원 목록 조회
* 회원 권한 변경
* 회원 삭제
* 가입 가능 명단 업로드
* 자료실 파일 관리
* 추후 공지사항 및 커뮤니티 관리 기능 확장 예정

---

## 기술 스택

### Frontend

| 구분              | 기술           |
| --------------- | ------------ |
| Framework       | React        |
| Build Tool      | Vite         |
| Language        | JavaScript   |
| Styling         | Tailwind CSS |
| Icon            | lucide-react |
| Package Manager | npm          |

### Backend

| 구분         | 기술                   |
| ---------- | -------------------- |
| Framework  | Spring Boot          |
| Language   | Java 21              |
| Build Tool | Gradle               |
| Security   | Spring Security      |
| Auth       | JWT                  |
| Database   | H2 Database          |
| ORM        | Spring Data JPA      |
| Monitoring | Spring Boot Actuator |

### Infra / Deployment

| 구분              | 기술                                       |
| --------------- | ---------------------------------------- |
| Server          | COM's 자체 인하우스 서버                         |
| OS              | Ubuntu Server                            |
| Web Server      | Nginx                                    |
| Backend Runtime | Java 21                                  |
| Process Manager | systemd 또는 Docker                        |
| Container       | Docker 선택 가능                             |
| Domain          | COM's 보유 도메인 또는 학교 제공 도메인                |
| HTTPS           | Let's Encrypt 적용 권장                      |
| Collaboration   | GitHub Issues / Pull Requests / Projects |

---

## 프로젝트 구조

```text
coms-website
├── .github
│   └── workflows
├── backend
│   ├── gradle
│   │   └── wrapper
│   ├── src
│   │   └── main
│   │       ├── java
│   │       │   └── com
│   │       │       └── coms
│   │       │           └── backend
│   │       │               ├── controller
│   │       │               └── BackendApplication.java
│   │       └── resources
│   │           └── application.properties
│   ├── build.gradle
│   ├── gradlew
│   ├── gradlew.bat
│   └── settings.gradle
├── public
├── src
│   ├── assets
│   ├── components
│   ├── pages
│   ├── utils
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
```

---

## 프론트엔드 구조

프론트엔드는 React와 Vite 기반으로 구성되어 있습니다.

### 주요 역할

* COM's 공식 랜딩 페이지 구성
* 동아리 소개, 활동, 프로젝트, 모집 안내 UI 제공
* 로그인 및 회원가입 페이지 제공
* 백엔드 API와 연동
* 반응형 웹 UI 구성

### 주요 디렉터리

| 경로               | 설명                       |
| ---------------- | ------------------------ |
| `src/assets`     | 이미지, 로고, 아이콘 등 정적 리소스    |
| `src/components` | 공통 컴포넌트                  |
| `src/pages`      | 페이지 단위 컴포넌트              |
| `src/utils`      | 공통 유틸리티 함수               |
| `src/App.jsx`    | 전체 화면 및 라우팅 중심 컴포넌트      |
| `src/main.jsx`   | React 앱 진입점              |
| `src/index.css`  | 전역 스타일 및 Tailwind CSS 설정 |

---

## 백엔드 구조

백엔드는 `backend` 폴더 안에 Spring Boot 프로젝트로 구성되어 있습니다.

### 주요 역할

* 회원가입 및 로그인 처리
* JWT 기반 인증 처리
* 관리자 권한 관리
* 커뮤니티 게시글 API 제공
* 자료실 파일 API 제공
* 서버 상태 확인 API 제공

### 주요 API 영역

| 영역    | 경로                                   | 설명                                |
| ----- | ------------------------------------ | --------------------------------- |
| 인증    | `/api/auth`                          | 회원가입, 로그인, 로그아웃, 내 정보 조회          |
| 관리자   | `/api/admin`                         | 회원 목록, 권한 변경, 회원 삭제, 가입 가능 명단 업로드 |
| 자료실   | `/api/files`                         | 파일 업로드, 목록 조회, 다운로드, 삭제           |
| 커뮤니티  | `/api/community/posts`               | 게시글 목록, 작성, 삭제                    |
| 서버 상태 | `/actuator/health`, `/actuator/info` | 서버 상태 확인                          |

---

## 인증 방식

본 프로젝트는 JWT 기반 인증 방식을 사용합니다.

* 로그인 성공 시 JWT 발급
* 인증이 필요한 API는 토큰 검증 후 접근 가능
* 관리자 API는 관리자 권한이 있는 사용자만 접근 가능
* 추후 운영 환경에서는 HttpOnly Cookie 기반 인증 적용 권장

---

## 환경 변수 설정

프로젝트 루트의 `.env.example`을 참고하여 `.env` 파일을 생성합니다.

```env
# Frontend
VITE_API_BASE_URL=/api

# Backend
SERVER_PORT=8080
JWT_SECRET=change-me-change-me-change-me-change-me
DB_NAME=comsdb
DB_USER=coms
DB_PASSWORD=change-me
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
SPRING_JPA_HIBERNATE_DDL_AUTO=update
```

주의사항:

* `.env` 파일은 GitHub에 업로드하지 않습니다.
* `JWT_SECRET`은 실제 운영 환경에서 반드시 변경해야 합니다.
* 운영 서버에서는 충분히 긴 랜덤 문자열을 사용합니다.
* DB 비밀번호, 서버 키, 토큰 값 등 민감 정보는 코드에 직접 작성하지 않습니다.

---

## 설치 및 실행 방법

### 1. 저장소 클론

```bash
git clone https://github.com/kw-coms/coms-website.git
cd coms-website
```

---

## 프론트엔드 실행

### 1. 패키지 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

실행 후 브라우저에서 접속합니다.

```text
http://localhost:3000
```

또는 Vite 설정에 따라 다음 주소로 실행될 수 있습니다.

```text
http://localhost:5173
```

### 3. 프론트엔드 빌드

```bash
npm run build
```

빌드 결과물은 `dist` 폴더에 생성됩니다.

### 4. 빌드 결과 미리보기

```bash
npm run preview
```

### 5. 코드 검사

```bash
npm run lint
```

---

## 백엔드 실행

### 1. backend 폴더로 이동

```bash
cd backend
```

### 2. 백엔드 실행

Windows 환경:

```bash
gradlew.bat bootRun
```

macOS / Linux 환경:

```bash
./gradlew bootRun
```

기본 실행 포트는 다음과 같습니다.

```text
http://localhost:8080
```

### 3. 서버 상태 확인

```text
http://localhost:8080/actuator/health
```

---

## 프론트엔드와 백엔드 연동

개발 환경에서는 프론트엔드에서 `/api` 경로로 요청을 보내고, 해당 요청을 백엔드 서버로 전달하는 구조를 사용합니다.

```text
Frontend: http://localhost:3000
Backend : http://localhost:8080
API     : /api/*
```

예시:

```text
프론트엔드 요청: /api/auth/login
백엔드 처리 주소: http://localhost:8080/api/auth/login
```

---

## Docker 기반 실행

프로젝트에는 프론트엔드용 Dockerfile과 Docker Compose 설정 파일이 포함되어 있습니다.

### 프론트엔드 Docker 이미지 빌드

```bash
docker build -f Dockerfile.frontend -t coms-frontend .
```

### 프론트엔드 컨테이너 실행

```bash
docker run -p 3000:80 coms-frontend
```

접속 주소:

```text
http://localhost:3000
```

### Docker Compose 실행

```bash
docker compose up -d --build
```

주의사항:

* Docker Compose 운영 전 `.env` 파일을 먼저 설정해야 합니다.
* 운영 환경에서는 Nginx reverse proxy와 HTTPS 설정을 함께 구성하는 것을 권장합니다.
* 백엔드와 DB 컨테이너 구성은 운영 환경에 맞게 추가 설정이 필요할 수 있습니다.

---

## API 요약

### Auth API

| Method | Endpoint           | 설명               |
| ------ | ------------------ | ---------------- |
| POST   | `/api/auth/signup` | 회원가입             |
| POST   | `/api/auth/login`  | 로그인              |
| POST   | `/api/auth/logout` | 로그아웃             |
| GET    | `/api/auth/me`     | 현재 로그인 사용자 정보 조회 |

### Admin API

| Method | Endpoint                             | 설명           |
| ------ | ------------------------------------ | ------------ |
| GET    | `/api/admin/members`                 | 회원 목록 조회     |
| PATCH  | `/api/admin/members/{id}/role`       | 회원 권한 변경     |
| DELETE | `/api/admin/members/{id}`            | 회원 삭제        |
| POST   | `/api/admin/eligible-members/import` | 가입 가능 명단 업로드 |

### File API

| Method | Endpoint                   | 설명       |
| ------ | -------------------------- | -------- |
| GET    | `/api/files`               | 파일 목록 조회 |
| POST   | `/api/files`               | 파일 업로드   |
| GET    | `/api/files/{id}/download` | 파일 다운로드  |
| DELETE | `/api/files/{id}`          | 파일 삭제    |

### Community API

| Method | Endpoint                    | 설명        |
| ------ | --------------------------- | --------- |
| GET    | `/api/community/posts`      | 게시글 목록 조회 |
| POST   | `/api/community/posts`      | 게시글 작성    |
| DELETE | `/api/community/posts/{id}` | 게시글 삭제    |

---

## 자체 인하우스 서버 운영 구조

COM's Website는 외부 클라우드 서비스가 아닌 COM's 자체 서버에서 운영하는 것을 기준으로 합니다.

권장 운영 구조는 다음과 같습니다.

```text
사용자
  ↓
도메인
  ↓
공유기 / 방화벽 / 보안 장비
  ↓
COM's 인하우스 서버
  ↓
Nginx
  ├── React 정적 파일 제공
  └── /api 요청을 Spring Boot Backend로 프록시
      ↓
      Spring Boot Backend
      ↓
      Database / File Storage
```

---

## 자체 서버 배포 흐름

### 1. 서버 접속

```bash
ssh 사용자명@서버IP
```

### 2. 프로젝트 클론

```bash
git clone https://github.com/kw-coms/coms-website.git
cd coms-website
```

### 3. 프론트엔드 빌드

```bash
npm install
npm run build
```

### 4. Nginx 정적 파일 경로로 복사

```bash
sudo mkdir -p /var/www/coms
sudo cp -r dist/* /var/www/coms/
```

### 5. 백엔드 빌드

```bash
cd backend
./gradlew build
```

### 6. 백엔드 실행

```bash
java -jar build/libs/*.jar
```

운영 환경에서는 `systemd` 서비스로 등록하여 서버 재부팅 후에도 자동 실행되도록 구성하는 것을 권장합니다.

---

## Nginx Reverse Proxy 예시

아래 설정은 자체 서버에서 React 정적 파일을 제공하고, `/api` 요청을 Spring Boot 백엔드로 전달하는 예시입니다.

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    root /var/www/coms;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /actuator/ {
        proxy_pass http://localhost:8080/actuator/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

설정 적용:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## HTTPS 적용 권장

운영 서버에서는 HTTPS 적용을 권장합니다.

Let's Encrypt와 Certbot을 사용할 수 있습니다.

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx
```

인증서 자동 갱신 확인:

```bash
sudo certbot renew --dry-run
```

---

## 운영 서버 권장 환경

| 구분         | 권장 설정                                 |
| ---------- | ------------------------------------- |
| OS         | Ubuntu Server                         |
| Web Server | Nginx                                 |
| Frontend   | React 빌드 결과물                          |
| Backend    | Spring Boot JAR                       |
| Java       | Java 21                               |
| Process    | systemd                               |
| Database   | 개발: H2 / 운영: PostgreSQL 또는 MariaDB 권장 |
| Storage    | 서버 로컬 디스크 또는 추후 NAS                   |
| HTTPS      | Let's Encrypt                         |
| Firewall   | UFW 또는 네트워크 장비 방화벽                    |
| Backup     | DB 및 업로드 파일 정기 백업                     |

---

## 서버 운영 시 주의사항

* 운영 서버에서는 `npm run dev`가 아니라 `npm run build` 결과물을 배포합니다.
* 백엔드는 `bootRun`보다 JAR 빌드 후 실행하는 방식을 권장합니다.
* `.env` 파일과 민감 정보는 GitHub에 업로드하지 않습니다.
* 운영 DB는 H2보다 PostgreSQL 또는 MariaDB 사용을 권장합니다.
* 파일 업로드 기능은 저장 경로, 파일 크기, 확장자 제한을 반드시 설정해야 합니다.
* 서버 로컬 저장소를 사용할 경우 정기 백업 정책이 필요합니다.
* 외부 접속을 위해 공유기 포트포워딩 또는 학교 네트워크 설정이 필요할 수 있습니다.
* 방화벽에서 필요한 포트만 열어야 합니다.
* HTTPS 적용 후 HTTP 요청은 HTTPS로 리다이렉트하는 것을 권장합니다.

---

## Git Branch 전략

COM's Website는 Pull Request 기반 협업을 원칙으로 합니다.

### 기본 브랜치

| 브랜치         | 용도             |
| ----------- | -------------- |
| `main`      | 배포 가능한 안정 버전   |
| `develop`   | 개발 통합 브랜치      |
| `feature/*` | 기능 개발 브랜치      |
| `fix/*`     | 버그 수정 브랜치      |
| `docs/*`    | 문서 수정 브랜치      |
| `chore/*`   | 설정 및 기타 작업 브랜치 |

### 브랜치 생성 예시

```bash
git checkout main
git pull origin main
git checkout -b feature/login-page
```

### 작업 완료 후 Push

```bash
git add .
git commit -m "feat: 로그인 페이지 UI 구현"
git push origin feature/login-page
```

---

## Commit Convention

커밋 메시지는 다음 규칙을 사용합니다.

| Type       | 설명                         |
| ---------- | -------------------------- |
| `feat`     | 새로운 기능 추가                  |
| `fix`      | 버그 수정                      |
| `design`   | UI / 디자인 수정                |
| `style`    | 코드 포맷팅, 세미콜론 등 기능 변화 없는 수정 |
| `refactor` | 코드 리팩토링                    |
| `docs`     | 문서 수정                      |
| `test`     | 테스트 코드 추가 또는 수정            |
| `chore`    | 빌드, 설정, 패키지 등 기타 작업        |

예시:

```bash
git commit -m "feat: 회원가입 API 연동"
git commit -m "fix: 모바일 화면 스크롤 오류 수정"
git commit -m "design: 메인 페이지 카드 UI 개선"
git commit -m "docs: README 인하우스 서버 배포 방식 정리"
```

---

## Pull Request 규칙

* `main` 브랜치에 직접 Push하지 않습니다.
* 모든 작업은 기능 브랜치에서 진행합니다.
* 작업 완료 후 Pull Request를 생성합니다.
* 최소 1명 이상의 확인 후 병합하는 것을 권장합니다.
* 충돌이 발생하면 작업자가 직접 해결한 뒤 다시 요청합니다.
* 병합이 끝난 브랜치는 삭제합니다.
* 배포 전에는 로컬 실행, 빌드, lint 검사를 확인합니다.

---

## GitHub Issues 관리

작업은 GitHub Issues를 통해 관리합니다.

추천 라벨은 다음과 같습니다.

| Label             | 설명          |
| ----------------- | ----------- |
| `frontend`        | 프론트엔드 작업    |
| `backend`         | 백엔드 작업      |
| `design`          | UI/UX 디자인   |
| `auth`            | 로그인/회원가입/권한 |
| `community`       | 커뮤니티 기능     |
| `archive`         | 자료실 기능      |
| `admin`           | 관리자 기능      |
| `infra`           | 서버/배포/인프라   |
| `docs`            | 문서 작업       |
| `bug`             | 오류 수정       |
| `feature`         | 신규 기능       |
| `priority-high`   | 높은 우선순위     |
| `priority-medium` | 중간 우선순위     |
| `priority-low`    | 낮은 우선순위     |

---

## 개발 예정 기능

### Frontend

* 모바일 반응형 UI 개선
* Recruit 상세 페이지 완성
* Contact 페이지 또는 외부 문의 링크 연결
* 로그인 상태별 메뉴 분기
* 관리자 페이지 UI 제작
* 커뮤니티 페이지 UI 제작
* 자료실 페이지 UI 제작

### Backend

* 회원가입 승인 구조 개선
* 관리자 권한 관리 고도화
* 커뮤니티 게시글 수정 기능
* 댓글 기능
* 공지사항 기능
* 자료실 파일 권한 관리
* 파일 업로드 검증 강화
* 운영용 DB 연동
* API 문서화

### Infra

* Ubuntu Server 배포 환경 구성
* Nginx reverse proxy 구성
* HTTPS 인증서 적용
* 도메인 연결
* systemd 서비스 등록
* 서버 로그 관리
* DB 및 업로드 파일 백업 정책 수립
* 추후 NAS 또는 별도 스토리지 연동

---

## 실행 확인 체크리스트

프론트엔드 실행 전 확인:

```bash
node -v
npm -v
npm install
npm run dev
```

백엔드 실행 전 확인:

```bash
java -version
cd backend
./gradlew bootRun
```

API 확인:

```text
GET http://localhost:8080/actuator/health
```

프론트 접속:

```text
http://localhost:3000
```

또는

```text
http://localhost:5173
```

---

## 참고 저장소

현재 COM's Website 저장소:

```text
https://github.com/kw-coms/coms-website
```

기존 COM's 서버 참고 저장소:

```text
https://github.com/coms-server/ComsWebService
```

---

## Maintainers

COM's Website는 광운대학교 중앙 컴퓨터 학술동아리 COM's에서 관리합니다.

프로젝트 운영, 개발, 디자인, 문서화는 COM's 내부 구성원들의 협업을 통해 진행됩니다.

---

## License

본 프로젝트는 COM's 내부 운영 목적의 공식 웹사이트 프로젝트입니다.

라이선스 정책은 추후 확정 예정입니다.
