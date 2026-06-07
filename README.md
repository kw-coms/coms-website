# COM's Website

광운대학교 중앙 컴퓨터 학술동아리 **COM's**의 공식 웹사이트 프로젝트입니다.

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
