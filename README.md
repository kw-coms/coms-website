# COM's Website

광운대학교 중앙 컴퓨터 학술동아리 **COM's**의 공식 웹사이트 프로젝트입니다.

동아리 소개, 활동 안내, 회원 모집, 공지사항, 커뮤니티, 자료실 등 COM's의 다양한 정보를 제공하기 위한 웹 서비스입니다.

---

## 프로젝트 소개

COM's Website는 광운대학교 중앙 컴퓨터 학술동아리 COM's를 소개하고, 동아리 운영에 필요한 기능을 웹으로 제공하기 위해 제작되었습니다.

주요 목적은 다음과 같습니다.

- COM's 동아리 소개
- 신입 부원 모집 안내
- 동아리 활동 및 프로젝트 소개
- 공지사항 및 커뮤니티 운영
- 회원 전용 자료실 제공
- 추후 로그인 및 회원 관리 기능 확장

---

## 주요 기능

현재 또는 추후 구현 예정인 기능은 다음과 같습니다.

### 기본 페이지

- 메인 페이지
- 동아리 소개 페이지
- 활동 소개 페이지
- 프로젝트 소개 페이지
- 모집 안내 페이지
- 문의하기 페이지

### 회원 기능

- 회원가입
- 로그인
- 로그아웃
- 회원 전용 페이지 접근
- 관리자 권한 관리

### 커뮤니티 기능

- 게시글 작성
- 게시글 수정 및 삭제
- 댓글 기능
- 공지사항 등록
- 회원 전용 게시판

### 자료실 기능

- 로그인한 회원만 접근 가능
- 강의 자료 업로드
- 프로젝트 자료 공유
- 문서 및 파일 다운로드

### 영상 및 스토리지 기능

- 동아리 강의 영상 업로드
- 자체 스토리지 서버 연동
- 영상 파일 관리
- 추후 HLS 기반 영상 스트리밍 확장 예정

---

## 기술 스택

### Frontend

- React
- Vite
- JavaScript
- CSS
- Tailwind CSS

### Development Tools

- Node.js
- npm
- ESLint
- Git / GitHub

### 추후 연동 예정

- Spring Boot 또는 Node.js 기반 백엔드 서버
- MariaDB 또는 PostgreSQL
- 자체 스토리지 서버
- MinIO 또는 S3 호환 스토리지
- Nginx
- Docker

---

## 프로젝트 구조

```bash
coms-website
├── public
├── src
│   ├── assets
│   ├── components
│   ├── pages
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md

(구) 컴스 : https://github.com/coms-server/ComsWebService
