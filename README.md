This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Meeting Copilot (`/meeting`)

A private meeting assistant for Darija/French meetings. It listens to the meeting, keeps a precise bilingual transcript, and produces action items, decisions, risks, open questions, a candid analysis, project and process suggestions, and a ready-to-send follow-up message.

**How it works**

1. **Capture** (browser): mic for in-room meetings, or mic plus the meeting tab's audio for Meet/Teams calls (Chrome: tick "Share tab audio"). You can also upload a recording. Audio becomes 16 kHz mono WAV chunks of about 45 s, cut at pauses so words aren't split.
2. **Speech-to-text** (`lib/meeting/stt.ts`): ElevenLabs Scribe or OpenAI, with diarization, language auto-detect and no forced language (forcing one hurts code-switched speech).
3. **Fidelity pass** (Claude, per chunk): keeps the original wording and script, fixes ASR errors on names, numbers and glossary terms, keeps speaker labels consistent across chunks, adds a faithful translation, and flags uncertain passages instead of guessing.
4. **Digest** (Claude): every claim is anchored to a verbatim quote and timestamp. It separates said from inferred, rates commitment strength ("inchallah" without a date = soft), and lists what needs clarifying. It runs automatically every 5 min during the meeting, and on demand for the final version.

**Setup**: copy `.env.example` to `.env.local` and fill in the keys. Run `npm run dev` and open `/meeting`.

**Tips for precision**
- Fill in participants and glossary before you start. That is what lets the agent fix names and jargon.
- Click a speaker label to rename it everywhere (e.g. "Speaker B" to "Salma").
- No STT vendor publishes Darija benchmarks. Record one real meeting and compare `STT_PROVIDER`s on it.
- Tell participants the meeting is recorded (Law 09-08 in Morocco).

Transcript and digest stay in the browser (localStorage). Nothing is stored server-side.
