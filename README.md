# Kira

Kira is an open-source AI interface primarily for [Hack Club AI](https://ai.hackclub.com), with support for external cloud & local OpenAI-compatible APIs.
Kira does **not** sell user information. Chats stay on your device by default; if the optional account layer is enabled they are also mirrored to your account.

<img width="3024" height="1891" alt="kira" src="https://github.com/user-attachments/assets/baa6493e-6a98-49b9-981d-cb51433a743c" />

- Data is stored locally on your device, with optional account sync
- Full Markdown & LaTeX Support
- Document, image, and text/code file upload support
- Image generation support
- Sandboxed local projects & workspaces with code execution
- Personalizable with name, occupation, and custom instructions
- Web search & web crawling tools
- Incognito mode to prevent chat history or memory from being saved
- Opt-in notepad that remembers user details/preferences/opinions across chats
- Conversation branching with message editing/regenerating
- Quote part of a reply: select text in an answer and click Quote to reply to it
- Optional follow-up suggestions under each answer (off by default; one extra request per answer)
- Context compression system
- Programmable keybinds
- Voice dictation into the composer (in browsers with the Web Speech API)
- Read assistant messages aloud (in browsers with speech synthesis)
- Inline, sandboxed previews for HTML and SVG code blocks

## Todo

You can suggest ideas in the Issues tab of the GitHub repo

## Setup

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

### Install Dependencies

```sh
npm install
```

### Run Unit Tests
```sh
npm test
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

## License

This project is licensed under the [MIT License](./LICENSE).

## AI disclosure

AI coding assistance was used during implementation, debugging and build verification. Product direction and final acceptance remained with me.
