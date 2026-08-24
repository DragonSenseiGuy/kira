# Libre Assistant

Libre Assistant is an open-source AI interface primarily for [Hack Club AI](https://ai.hackclub.com), but with support for external cloud & local OpenAI-compatible APIs.
Libre Assistant does **not** sell or store user information, and all chat & user data is stored on your device.

## Features

- All data is stored locally on your device.
- Full Markdown & LaTeX Support
- Document & image upload support
- Image generation support
- Sandboxed local projects & workspaces with code execution
- Personalizable with name, occupation, and custom instructions
- Web search & web crawling tools
- Incognito mode to prevent chat history or memory from being saved
- Opt-in notepad that remembers user details/preferences/opinions across chats
- Conversation branching with message editing/regenerating
- Context compression system
- Programmable keybinds

## Todo

- voice-to-text input feature

You can suggest other ideas in the Issues tab of the GitHub repo

## VSCode Setup

[VSCode](https://code.visualstudio.com/).

### Clone Project and Move into Its Folder

```sh
git clone https://github.com/Mostlime12195/Libre-Assistant.git
cd libre-assistant
```

### Set Environment Variables

```env
NUXT_SESSION_SECRET
```
`NUXT_SESSION_SECRET` is required for sessions to function

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
