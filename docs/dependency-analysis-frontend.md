# Frontend 의존성 분석 (Next.js)

> Generated: 2026-03-11 | Source: Step 1.1

## 환경 요구사항

| 항목 | 요구사항 |
|------|---------|
| Node.js | **20+** 필수 |
| 패키지 매니저 | **pnpm** |

## 핵심 패키지 (package.json)

```json
{
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "typescript": "^5",

    "@mui/material": "^6",
    "@mui/icons-material": "^6",
    "@emotion/react": "^11",
    "@emotion/styled": "^11",

    "@clerk/nextjs": "latest",

    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "latest",

    "@fontsource/pretendard": "latest"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^8",
    "eslint-config-next": "latest"
  }
}
```

## 환경 변수 (.env.local.example)

```bash
# FastAPI Backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Naver Maps (Frontend)
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=

# Supabase (Frontend 읽기 전용)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## 폴더 구조

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (consultation)/
│   │   └── consultation/
│   │       ├── onboarding/page.tsx      # S-01
│   │       ├── screening/page.tsx       # S-02
│   │       ├── recommendation/page.tsx  # S-03
│   │       ├── hospital-search/page.tsx # S-04
│   │       ├── hospital-detail/[id]/page.tsx # S-05
│   │       └── summary/page.tsx         # S-06
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/           # AppBar, ProgressBar, EmergencyModal, ...
│   ├── screens/      # S01~S06 화면 컴포넌트
│   ├── chat/         # ChatBubble, TypingIndicator, ...
│   ├── maps/         # NaverMapEmbed, MiniMap
│   ├── hospital/     # HospitalCard, DirectionsButtons, ...
│   ├── recommendation/ # DepartmentCard, UrgencyBadge
│   ├── pdf/          # ConsultationPDFTemplate
│   └── layout/       # ConsultationLayout
├── lib/
│   ├── api/          # consultation.ts, types.ts
│   ├── theme/        # MUI 테마
│   ├── consent/      # useConsent.ts
│   ├── consultation/ # useSession.ts
│   └── toast/        # useToast.ts
├── middleware.ts
└── types/
```
