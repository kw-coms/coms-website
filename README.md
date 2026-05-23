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
- 로그인 및 회원 관리 기능 확장
- 자료실 및 영상 콘텐츠 관리 기능 제공

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
- JWT 기반 인증 연동 예정

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
- AWS S3 기반 파일 저장 구조 연동 예정

### 영상 및 스토리지 기능

- 동아리 강의 영상 업로드
- 영상 원본 파일 저장
- 영상 썸네일 관리
- AWS S3 기반 스토리지 연동
- 추후 HLS 기반 영상 스트리밍 확장 예정

---

## 기술 스택

### Frontend

- React
- Vite
- JavaScript
- CSS
- Tailwind CSS

### Hosting & Deployment

- AWS Amplify Hosting
- GitHub 연동 자동 배포
- main 브랜치 merge 시 자동 배포

### Storage

- AWS S3
- 자료실 파일 저장
- 게시글 첨부파일 저장
- 프로필 이미지 저장
- 영상 파일 저장
- Presigned URL 기반 업로드 / 다운로드 구조 예정

### Backend 예정

- Spring Boot
- MariaDB
- JWT Authentication
- REST API
- AWS S3 Presigned URL 연동

### Development Tools

- Node.js
- npm
- ESLint
- Git / GitHub
- GitHub Projects
- GitHub Issues
- Pull Request 기반 협업

---

## 프로젝트 구조

```bash
coms-website
├── public
├── src
│   ├── assets
│   │   ├── icons
│   │   ├── images
│   │   └── logos
│   ├── components
│   │   ├── archive
│   │   ├── auth
│   │   ├── common
│   │   ├── home
│   │   └── layout
│   ├── data
│   ├── hooks
│   ├── pages
│   ├── routes
│   ├── services
│   ├── styles
│   ├── utils
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```
## AWS S3 스토리지

COM's Website는 프론트엔드 배포와 파일 저장소를 분리하여 운영합니다.

프론트엔드는 AWS Amplify Hosting을 통해 배포하고, 자료실 파일, 프로필 이미지, 게시글 첨부파일, 영상 파일 등은 AWS S3를 스토리지 서버로 사용합니다.

S3 사용 목적

AWS S3는 다음 파일들을 저장하기 위해 사용합니다.

- 자료실 문서 파일
- 게시글 첨부파일
- 회원 프로필 이미지
- 영상 원본 파일
- 영상 썸네일 이미지
- 추후 HLS 기반 영상 스트리밍 파일
## S3 버킷 정보
```
Bucket Name: kw-coms-storage-2026
Region: ap-northeast-1
Purpose: COM's 웹사이트 파일 및 영상 스토리지
```
## S3 폴더 구조
```Bash
kw-coms-storage-2026
├── attachments/
├── profiles/
├── documents/
├── thumbnails/
├── videos-original/
└── videos-hls/
```
폴더별 용도
폴더	용도
attachments     /	  게시글 첨부파일 저장
profiles        /   회원 프로필 이미지 저장
documents       /	  자료실 문서, PDF, PPT, ZIP 파일 저장
thumbnails      /	  영상 썸네일 이미지 저장
videos-original /	  업로드된 원본 영상 파일 저장
videos-hls      /	  HLS 변환된 영상 스트리밍 파일 저장

## 접근 방식
S3 버킷은 보안상 public으로 열지 않습니다.
자료실, 영상, 프로필 이미지 등은 추후 백엔드 서버에서 사용자 권한을 확인한 뒤, Presigned URL을 발급하여 업로드 및 다운로드하는 방식으로 구현할 예정입니다.
업로드 예상 흐름은 다음과 같습니다.
```
사용자
→ 프론트엔드에서 파일 업로드 요청
→ 백엔드에서 로그인 및 권한 확인
→ 백엔드가 S3 Presigned URL 발급
→ 프론트엔드가 S3로 직접 파일 업로드
→ 백엔드가 파일 메타데이터를 DB에 저장
```
## 보안 정책
- S3 버킷은 기본적으로 private 상태로 유지합니다.
- 모든 퍼블릭 액세스 차단을 활성화합니다.
- 파일 접근은 백엔드 권한 확인 후 Presigned URL로 처리합니다.
- 민감한 파일 URL을 프론트엔드 코드에 직접 노출하지 않습니다.
- AWS Access Key, Secret Key는 GitHub에 업로드하지 않습니다.

## 추후 연동 예정
- Spring Boot 백엔드와 S3 연동
- S3 Presigned URL 발급 API 구현
- 자료실 파일 업로드 / 다운로드 API 구현
- 영상 업로드 및 메타데이터 관리
- 영상 썸네일 및 HLS 변환 파일 관리

## 설치 및 실행 방법

## 1.저장소 클론
```Bash
git clone https://github.com/kw-coms/coms-website.git
cd coms-website
```
## 2. 패키지 설치
```Bash
npm install
```
실행 후 브라우저에서 아래 주소로 접속합니다.
```
http://localhost:5173
```
## 빌드 방법
배포용 파일을 생성하려면 아래 명령어를 실행합니다.
```Bash
npm run build
```
## 빌드 결과 미리보기
```Bash
npm run preview
```
## 코드 검사
```Bash
npm run lint
```
## 배포 환경
## COM's Website는 AWS Amplify Hosting을 통해 배포됩니다.
## 배포 구조는 다음과 같습니다.
```
GitHub Repository
  ↓
Pull Request
  ↓
main 브랜치 merge
  ↓
AWS Amplify 자동 빌드
  ↓
AWS Amplify Hosting 배포
```
현재 프론트엔드 저장소 : https://github.com/kw-coms/coms-website

## 배포 방식:
- GitHub main 브랜치 기준 자동 배포
- Pull Request merge 후 AWS Amplify에서 자동 빌드 및 배포
- Vercel 배포는 사용하지 않음

## 협업 규칙
Branch
main 브랜치에는 직접 Push하지 않습니다.
작업할 때는 기능별 브랜치를 생성하여 작업하니다.
```브랜치 이름 예시:
feature/login-page
feature/signup-page
feature/about-page
feature/archive-page
feature/admin-page
fix/mobile-layout
docs/readme
chore/project-folder-structure
```
## 작업 시작
```Bash
git checkout main
git pull origin main
git checkout -b feature/작업이름
```
## 작업 완료후
``` Bash
git add .
git commit -m "feat: 작업 내용"
git push origin feature/작업이름
```
## Commit Convention
```
feat: 새로운 기능 추가
fix: 오류 수정
design: 디자인 수정
style: 코드 스타일 수정
docs: 문서 수정
refactor: 코드 리팩토링
chore: 설정 및 기타 작업
```
## 예시
```
git commit -m "feat: 로그인 페이지 UI 제작"
git commit -m "design: 메인 페이지 반응형 수정"
git commit -m "docs: README 정리"
```
## Pull Request 규칙
```
모든 작업은 Pull Request를 통해 main 브랜치에 병합합니다.
최소 1명 이상의 리뷰 후 병합하는 것을 원칙으로 합니다.
PR merge 후 AWS Amplify를 통해 자동 배포됩니다.
작업이 끝난 브랜치는 merge 후 삭제합니다.
```
## GitHub Project 관리
COM's Website는 GitHub Projects와 Issues를 활용하여 작업을 관리합니다.
작업 흐름은 다음과 같습니다.

```
Todo
→ In Progress
→ Review
→ Done
```
Issue에는 다음과 같은 라벨을 사용합니다.
```
frontend
backend
design
page
auth
archive
storage
infra
documentation
feature
bug
priority-high
priority-medium
priority-low
```
## 백엔드 개발 예정 구조
백엔드는 별도 저장소에서 개발할 예정입니다.
```예정 저장소명:
kw-coms/coms-backend
```
## 예정 기술 스택:
- Spring Boot
- MariaDB
- JWT Authentication
- AWS S3
- REST API
## 백엔드 주요 기능:
- 회원가입 / 로그인
- JWT 기반 인증
- 회원 권한 관리
- 자료실 API
- 파일 업로드 / 다운로드 API
- S3 Presigned URL 발급
- 게시판 / 커뮤니티 API
- 관리자 페이지용 API
- 영상 업로드 메타데이터 관리

## 참고 자료: 구 COM's 서버
본 프로젝트는 COM's 웹사이트를 새롭게 구축하기 위한 프론트엔드 프로젝트입니다.
기존 COM's 웹서비스는 아래 저장소에서 확인할 수 있습니다.
```
https://github.com/coms-server/ComsWebService
```
해당 저장소는 과거 COM's 웹페이지 운영을 위해 사용된 서버 프로젝트이며, 기존 서비스의 구조와 기능을 참고하기 위한 목적으로 보관합니다.

## 구 서버 주요 참고 항목
- 회원가입 및 로그인 구조
- 게시판 및 커뮤니티 기능
- 자료실 및 첨부파일 관리 방식
- 관리자 기능 구조
- 동아리 소개 및 정적 정보 관리 방식
- 서버 기반 웹서비스 운영 구조

## 참고 시 주의사항
구 COM's 서버 프로젝트는 현재 새 웹사이트의 직접적인 배포 대상이 아닙니다.
현재 kw-coms/coms-website 프로젝트는 React와 Vite 기반의 신규 프론트엔드 프로젝트이며, 기존 서버 저장소는 기능 설계와 구조 참고용으로만 활용합니다.
추후 백엔드, 데이터베이스, 스토리지 서버를 구축할 때 기존 서버의 기능을 참고하여 새로운 구조에 맞게 재설계할 예정입니다.

## 향후 개발 계획
- App.jsx 페이지 컴포넌트 분리
- Header / Footer 공통 컴포넌트화
- 상단 네비게이션 이동 기능 구현
- 메인 페이지 버튼 이동 기능 구현
- 로그인 페이지 UI 제작
- 회원가입 페이지 UI 제작
- 자료실 페이지 제작
- 관리자 페이지 설계
- Spring Boot 백엔드 서버 구축
- MariaDB 데이터베이스 설계
- AWS S3 Presigned URL 연동
- 게시판 및 커뮤니티 기능 구현
- 영상 업로드 및 관리 기능 구현

## COM's
COM's는 광운대학교 중앙 컴퓨터 학술동아리입니다.
프로그래밍, 웹 개발, 알고리즘, 인공지능, 서버, 보안 등 다양한 컴퓨터 분야를 함께 공부하고 프로젝트를 진행하며 성장하는 것을 목표로 합니다.

## Contact
- Instagram: @kw_coms
- GitHub Organization: kw-coms
- Frontend Repository: coms-website
- 
## License
본 프로젝트는 COM's 동아리 웹사이트 제작 및 운영을 목적으로 제작되었습니다.
무단 복제 및 상업적 사용을 금지합니다.
``` README
수정 후 올릴 때는 이렇게 하시면 됩니다.

```bash
git checkout main
git pull origin main
git checkout -b docs/update-readme
```

```Bash
git add README.md
git commit -m "docs: README 프로젝트 현황 업데이트"
git push -u origin docs/update-readme
