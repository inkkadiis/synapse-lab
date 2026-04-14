# Synapse Lab

Synapse Lab is a research workspace for BCI, HCI, and Zero-UI papers.  
It collects papers, previews PDFs, generates AI summaries, and stores analysis per paper.

## Features

- Collect recent papers from arXiv and bioRxiv
- Preview paper PDFs in-app (with external fallback links)
- Generate Korean analysis reports with Gemini
- Save analysis per paper with a saved timestamp
- Test locally with a debug account (no Firebase login required)

## Stack

- Frontend: React, Vite, Tailwind, shadcn/ui
- Backend: Express with Vite middleware
- Data/Auth: Firebase Firestore and Firebase Auth
- AI: Google Gemini (`@google/genai`)

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Create `.env.local` in the project root

```env
GEMINI_API_KEY=your_gemini_api_key

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIRESTORE_DATABASE_ID=
```

3. Run development server

```bash
npm run dev
```

4. Open `http://localhost:3000`

## Debug Login (Local)

- In dev mode, use `Local Debug Login` on the sign-in screen
- This bypasses Firebase Auth for local testing
- Debug user data is saved to browser `localStorage`

## Scripts

- `npm run dev`: Start Express + Vite dev server
- `npm run build`: Build production bundle
- `npm run lint`: Run TypeScript checks (`tsc --noEmit`)

## CI/CD Workflows

### Pull Request Preview

- File: `.github/workflows/firebase-hosting-pull-request.yml`
- Flow: `npm ci` -> `npm run build` -> Firebase Hosting preview deploy

### Main Branch Deploy

- File: `.github/workflows/firebase-hosting-merge.yml`
- Flow: push to `main` -> `npm ci` -> `npm run build` -> Firebase Hosting live deploy

## Required GitHub Secrets

### AI

- `GEMINI_API_KEY`

### Firebase (Build-Time Frontend Config)

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIRESTORE_DATABASE_ID`

### Firebase Deploy

- `FIREBASE_SERVICE_ACCOUNT_GEN_LANG_CLIENT_0963225443`

## Notes

- Some sources block iframe embedding. In that case, use:
  - `Paper Page`
  - `Open Original PDF`
- AI analysis runs independently of iframe rendering through `/api/extract-pdf`.

---

## 한국어 안내

### 프로젝트 개요

Synapse Lab은 BCI, HCI, Zero-UI 분야 논문을 수집하고, PDF 기반 AI 분석 결과를 논문별로 저장하는 연구용 앱입니다.

### 주요 기능

- arXiv, bioRxiv 최신 논문 수집
- 앱 내 PDF 미리보기 + 외부 링크 열기
- Gemini 기반 한국어 분석 리포트 생성
- 논문별 분석 내용 및 저장 시각 기록
- 로컬 디버그 계정으로 Firebase 로그인 없이 테스트

### 로컬 실행 방법

1. 의존성 설치

```bash
npm install
```

2. 루트에 `.env.local` 생성

```env
GEMINI_API_KEY=your_gemini_api_key

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIRESTORE_DATABASE_ID=
```

3. 개발 서버 실행

```bash
npm run dev
```

4. 브라우저 접속: `http://localhost:3000`

### 로컬 디버그 로그인

- 개발 모드에서 로그인 화면의 `로컬 디버그 계정으로 로그인` 버튼 사용
- Firebase Auth 없이도 논문 수집/분석/저장 흐름 테스트 가능
- 디버그 데이터는 브라우저 `localStorage`에 저장됨

### 배포 워크플로

- PR 미리보기 배포: `.github/workflows/firebase-hosting-pull-request.yml`
- main 자동 배포: `.github/workflows/firebase-hosting-merge.yml`
- 빌드 흐름: `npm ci` -> `npm run build` -> Firebase Hosting 배포

### GitHub Secrets 필수 항목

- AI: `GEMINI_API_KEY`
- Firebase 빌드용:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_MEASUREMENT_ID`
  - `VITE_FIRESTORE_DATABASE_ID`
- Firebase 배포용:
  - `FIREBASE_SERVICE_ACCOUNT_GEN_LANG_CLIENT_0963225443`

### 참고 사항

- 일부 사이트는 iframe 임베딩을 차단할 수 있습니다.
- 이 경우 `논문 페이지` 또는 `원본 열기` 버튼으로 외부에서 확인하세요.
- AI 분석은 iframe 렌더링과 별개로 `/api/extract-pdf` 경로를 통해 동작합니다.

### 패치 노트

- 최신 이슈 및 변경 기록: `PATCH_NOTES.md`