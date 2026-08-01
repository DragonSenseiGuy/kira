# Kira

Kira is a **free, unlimited** AI Chatbot that uses various models through [Hack Club's free API](https://ai.hackclub.com).
Kira does **not** sell user information. By default all chat & user data is stored on your device; a
deployment can optionally enable accounts, which sync your chats to its own database (see
[Accounts](#accounts)).

<img width="3024" height="1891" alt="kira" src="https://github.com/user-attachments/assets/baa6493e-6a98-49b9-981d-cb51433a743c" />


## Features

- All data is stored locally on your device by default. No data leaves it unless accounts are enabled
- Optional accounts: sign up with an email and password to have your chats follow you between devices
- Full Markdown & LaTeX Support
- Image generation support
- Document analysis support
- Detailed code-blocks, including syntax highlighting, downloading, and copying
- Personalizable with name, occupation, and custom instructions
- Web search & web crawling tools
- Reasoning effort customizability
- Incognito mode to prevent chat history from being saved
- Notepad: an autonomously maintained, locally stored memory document that remembers your details/preferences/projects across chats
- Automatic and manual context compression to keep long conversations cheap without losing history
- Full zip backup & restore (conversations, branches, attachments, Notepad, settings), per-chat export, and OpenWebUI chat import
- Persistent per-conversation drafts, so unsent prompts survive switching chats
- Parameter configuration panel with temperature, top_p, seed options, and a web search toggle
- Conversation branching with message editing/regenerating

## Todo

- Canvas/Code Panel
- Tree-of-Thought (Multiple instances of the same or different models working together to solve a problem at the same time)

Please suggest more ideas in the Issues tab.

## VSCode Setup

[VSCode](https://code.visualstudio.com/).

### Clone Project and Move into Its Folder

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

## Accounts

Accounts are off unless `DATABASE_URL` points at a PostgreSQL database.

- **Without it** Kira behaves as it always has: no login, chats live in IndexedDB on the device.
- **With it** the app is gated behind a login screen. People sign up with an email and password, and
  their chats are saved to the database under their account, so they show up on any device they sign
  in from. IndexedDB stays the primary store, so the app keeps working while offline.

Everyone brings their own API key — there is no shared key. With accounts enabled the key is saved to
your account as well as your device, so you only paste it once and it works everywhere you sign in.

Passwords are stored as salted [scrypt](https://en.wikipedia.org/wiki/Scrypt) hashes — never in plain
text, and never recoverable from the database. API keys have to be usable again, so they're encrypted
with AES-256-GCM rather than hashed, and only ever returned to the account that owns them. Sessions
are HMAC-signed, httpOnly cookies, so the server never trusts a user id sent by the browser. Signing
out clears the locally cached chats and key, which keeps accounts separate on a shared browser.

The schema is applied automatically on server start; there is no migration step to run.

### Install Dependencies

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## Versioning

This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

To update the version, use npm version commands:

```bash
# Bump the patch version (x.y.z -> x.y.z+1)
npm version patch

# Bump the minor version (x.y.z -> x.y+1.0)
npm version minor

# Bump the major version (x.y.z -> x+1.0.0)
npm version major

# Or set an explicit version
npm version 1.2.3
```

All notable changes to this project are documented in the [CHANGELOG.md](./CHANGELOG.md) file.

## License

This project is licensed under the [MIT License](./LICENSE).

## AI disclosure

AI coding assistance was used during implementation, debugging and build verification. Product direction and final acceptance remained with me.
