# TriviaForce

Collaborative weekly trivia quiz app for small groups. Upload a quiz image, have your team submit and discuss answers, vote on the best ones, then self-mark when answers are revealed.

## Features

- Upload weekly quiz question images
- Each player submits answers with confidence levels (guess / maybe / certain)
- Upvote/downvote other players' answers
- Consensus column auto-populates from best answers; anyone can override
- Upload answer image for self-marking
- Track group score history across weeks
- Split-pane layout: see questions and answer grid simultaneously
- Shared passphrase keeps the quiz private
- Cookie-based identity remembers returning users

## Setup

```bash
npm install
cp .env.example .env   # then edit .env with your passwords
```

## Running

```bash
node server.js
```

The server reads config from `.env`. See `.env.example` for available options.

## Deployment (sprites.dev)

```bash
npm install --production
cp .env.example .env   # edit with production passwords
mkdir -p data uploads
node server.js          # or use pm2: pm2 start server.js --name triviaforce
```

## License

MIT - Michael Champanis
