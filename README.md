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

A private meeting assistant for Darija/French meetings that runs **on your own computer** and uses **your Claude subscription** (no Anthropic API billing).

### What it does
- **Precise bilingual transcript**: keeps what was said in the original language and script, with a faithful translation. Unclear passages are flagged, not guessed.
- **Asks you before naming anything**: unfamiliar names, companies and jargon go to a *To confirm* queue (Latin + Arabic spelling, role/meaning). Confirm once and it is used in every future meeting. Unconfirmed names appear with "(?)".
- **No filler**: every action, decision, risk and key point carries a verbatim quote and timestamp. Code checks each quote against the transcript and removes anything it can't find (listed under *Removed by evidence check*). Generic advice is banned by the prompt, and suggestions must point to a moment or a known fact.
- **How to run the work**: an ordered next-step sequence, a tracking method fitted to your team's tools, checkpoints, RAID/decision-log entries ready to paste, and a management report (RAG status, blockers, asks, ready-to-send note).
- **Learns over time**: a knowledge base you hand over, names you confirmed, learnings you approved, an action tracker carried across meetings (each digest reports progress on earlier actions), and the questions you ask. Nothing is remembered without your approval.

### Setup (on your machine)
1. Install Claude Code and sign in with your subscription: `claude auth login`. The *Memory & tracker* tab shows a green tick when this is right.
2. `cp .env.example .env.local` and add a speech-to-text key (ElevenLabs or OpenAI). This is a separate, small cost; Claude itself isn't billed per call.
3. `npm install && npm run dev`, then open http://localhost:3000/meeting.
4. Hand over your knowledge base: drop files (md, txt, pdf, csv, json; convert Word to PDF) into `workspace/knowledge/` or use *Add documents*.

The app can't run on Vercel or another server: subscription use goes through the Claude Code CLI on your machine.

### The workspace (`./workspace`, git-ignored)
```
knowledge/           documents you hand over
memory/lexicon.json  confirmed names & jargon (Arabic + Latin)
memory/notes.md      learnings you approved; edit freely
memory/actions.json  action tracker across meetings
meetings/<id>/       transcript.md, meeting.json, qa.md
```
It is plain files: back it up, edit it, or open it in Claude Code (`cd workspace && claude`) to talk to the agent directly with all its memory.

### Usage notes
- Claude calls count against your plan's usage limits. The per-chunk pass uses Sonnet; digests, Q&A and learning use Opus (`MEETING_MODEL_CHUNK`, `MEETING_MODEL`).
- The final digest searches your knowledge base and takes 2–4 minutes.
- No STT vendor publishes Darija benchmarks. Record one real meeting and compare providers.
- Tell participants the meeting is recorded (Law 09-08 in Morocco).
