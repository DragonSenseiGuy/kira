<template>
  <div>
    <div class="stx-header">
      <h2>About</h2>
      <p>Kira</p>
    </div>

    <!-- Version card — version comes from package.json at build time -->
    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Version</h3>
          <p>Currently running build</p>
        </div>
        <span class="stx-badge">v{{ appVersion }}</span>
      </div>
      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Project links</h3>
          <p>Source code, issues and releases</p>
        </div>
        <div class="link-row">
          <a
            v-for="link in projectLinks"
            :key="link.href"
            class="stx-btn link-pill"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon :icon="link.icon" width="18" height="18" />
            {{ link.label }}
          </a>
        </div>
      </div>
    </div>

    <div class="stx-card">
      <div class="stx-card-title">What is Kira?</div>
      <p class="about-paragraph">
        Kira is an open-source AI chat interface with a simple promise: your data is yours.
        Conversations, memory and settings live in your browser's local storage, and nothing is
        ever sold or profiled. If this instance has accounts enabled and you sign in, your chats
        are also mirrored to your account so they follow you between devices.
      </p>
      <p class="about-paragraph">
        It supports multiple AI providers out of the box (Hack Club AI plus any OpenAI-compatible
        endpoint you configure), web search, document and image uploads, conversation branching,
        near-lossless context compression and an opt-in Notepad that gives the assistant lasting
        memory of who you are.
      </p>
      <p class="about-paragraph" style="margin-bottom: 18px">
        Built as a Nuxt + Vue single-page app with a thin stateless server layer for relaying
        provider traffic.
      </p>
    </div>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue';

const REPO = 'https://github.com/DragonSenseiGuy/kira';

// Matches the "Source code, issues and releases" description above.
const projectLinks = [
  { label: 'GitHub', icon: 'mdi:github', href: REPO },
  { label: 'Issues', icon: 'material-symbols:bug-report-outline-rounded', href: `${REPO}/issues` },
  { label: 'Releases', icon: 'material-symbols:package-2-outline-rounded', href: `${REPO}/releases` },
];

const config = useRuntimeConfig();
// Read from build-time runtime config so this NEVER goes stale.
const appVersion = config.public.appVersion || 'dev';
</script>

<style scoped>
/* Pills wrap onto their own line rather than squeezing the description
   on narrow panels. */
.link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

/* .stx-btn is built for <button>; an anchor needs the underline removed
   and the inherited line-height pinned so the pill matches button height.
   (The old inline `padding: 4px 0` killed the horizontal padding entirely
   and left the label touching the border.) */
.link-pill {
  text-decoration: none;
  line-height: 1.2;
}

.about-paragraph {
  margin: 16px 0 0;
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--text-primary);
}

.about-paragraph:first-of-type {
  padding-top: 14px;
}
</style>
