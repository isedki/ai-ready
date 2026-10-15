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

A personal meeting agent for Darija/French meetings. It runs **on your own computer**, uses **your Claude subscription** (no Anthropic API billing), and is built for noisy open spaces.

### Start (no config files)
```bash
npm run copilot                  # checks setup, builds on first run, starts, opens the browser
npm run copilot -- --autostart   # start automatically at login, restart if it ever stops
npm run copilot -- --no-autostart
```
Before the first start, set up Claude Code once with `claude auth login`. On first open, the page asks for the one thing it needs: a speech-to-text key (ElevenLabs recommended), pasted into the page and saved on this computer. In Chrome or Edge, use *Install app* in the address bar to get it as a desktop app with its own icon.

It listens on `127.0.0.1:3939` only. Nothing outside your computer can reach it.

### What it does
- **During the meeting:** a precise bilingual transcript, and a live digest every 5 minutes with **"Say this now"** nudges (lock an owner or a date, raise a dodged point).
- **After the meeting:** actions, decisions and risks, each with a verbatim quote. A code check removes anything whose quote isn't in the transcript. You also get next steps, a tracking method, ready-to-paste log entries, a management report (RAG) and a follow-up message.
- **Between meetings (the "Today" tab):** a daily brief from your tracker and past meetings. It shows who to chase, with a draft message in the right register (Darija for WhatsApp, French for formal email), patterns across meetings, and what to prepare.
- **Asks before naming anything:** unfamiliar names and jargon go to a *To confirm* queue (Latin + Arabic), and confirmed names are remembered.
- **Learns:** your knowledge base, confirmed names, learnings you approve, the action tracker and the questions you ask (Ask tab).

### Noise and silence (open space)
- **Silence:** chunks with no speech are not transcribed (no cost, no invented text). They are shown as "silence skipped", and the analysis sees them as explicit gaps it must not fill in.
- **Rumble:** low-frequency rumble is filtered out, and the browser's noise suppression is on. A **NOISY** badge appears when speech barely stands out from the background.
- **Junk text:** text that speech-to-text invents from noise (subtitle credits, "thanks for watching", repetition loops) is removed before analysis.
- **Neighbours:** neighbours' conversations and phone calls are marked *background*. They are greyed out (hidden by default) and never used in the analysis or as evidence.
- **Unclear passages:** hard-to-hear passages are marked (?). Decisions or deadlines resting on them go to *Check with participants*.
- **Tips:** put the laptop or mic in the middle of the table. For calls, use *Mic + call tab* so remote voices come straight from the call, not through the room.

### The workspace (`./workspace`, git-ignored)
```
knowledge/           documents you hand over (md, txt, pdf, csv, json)
memory/lexicon.json  confirmed names & jargon (Arabic + Latin)
memory/notes.md      learnings you approved; edit freely
memory/actions.json  action tracker across meetings
meetings/<id>/       transcript.md, meeting.json, qa.md
briefs/<date>.json   daily briefs
settings.json        speech-to-text key (only on this computer)
```
Open it in Claude Code (`cd workspace && claude`) to talk to the agent directly with all its memory.

### Notes
- Claude usage counts against your plan's limits. The per-chunk pass uses Sonnet; digests, Q&A, briefs and learning use Opus (`MEETING_MODEL_CHUNK`, `MEETING_MODEL`).
- No STT vendor publishes Darija benchmarks. Record one real meeting and compare providers.
- Tell participants the meeting is recorded (Law 09-08 in Morocco).
