# Kira

Kira is a AI Chatbot that uses various models through [Hack Club's free API](https://ai.hackclub.com).

<img width="3024" height="1891" alt="kira" src="https://github.com/user-attachments/assets/baa6493e-6a98-49b9-981d-cb51433a743c" />

## Setup

```sh
git clone https://github.com/DragonSenseiGuy/kira.git
cd kira
```

### Set Environment Variables

Copy `.env.example` to `.env` and fill it in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NUXT_SESSION_SECRET` | Yes | Signs session tokens and account cookies |
| `DATABASE_URL` | No | PostgreSQL connection string. Setting it turns on accounts + chat sync |
| `NUXT_ENCRYPTION_KEY` | No | Encrypts stored API keys. Falls back to `NUXT_SESSION_SECRET` |

### Install Dependencies

```sh
npm install
```

### Run Dev server

```sh
npm run dev
```

## License

This project is licensed under the [MIT License](./LICENSE).

## AI disclosure

AI coding assistance was used during implementation, debugging and build verification. Product direction and final acceptance remained with me.
