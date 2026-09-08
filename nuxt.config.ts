// https://nuxt.com/docs/api/configuration/nuxt-config
import pkg from './package.json';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false, // We don't like SSR over here
  devtools: { enabled: true },

  // Add individual Nuxt SEO modules
  modules: [
    '@nuxtjs/sitemap',
    '@vueuse/nuxt'
  ],

  // Performance optimizations
  experimental: {
    payloadExtraction: false, // Disable if not needed since SSR is off
  },

  // Site configuration for SEO modules
  site: {
    url: 'https://kira.adityan.dev', // Replace with your actual domain
    name: 'Kira',
    description: 'An open-source AI chat assistant',
    defaultLocale: 'en', // default locale of your site
  },

  sitemap: {
    enabled: true,
  },

  app: {
    head: {
      title: 'Kira',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'An open-source AI chat assistant' },
        { name: 'theme-color', content: '#0285ff' }, // --accent
        { name: 'format-detection', content: 'telephone=no' },

        // SEO and social media meta tags
        { name: 'application-name', content: 'Kira' },
        { name: 'apple-mobile-web-app-title', content: 'Kira' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:url', content: 'https://kira.adityan.dev' },
        { name: 'twitter:title', content: 'Kira' },
        { name: 'twitter:description', content: 'An open-source AI chat assistant' },

        // Open Graph tags for social sharing
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://kira.adityan.dev' },
        { property: 'og:title', content: 'Kira' },
        { property: 'og:description', content: 'An open-source AI chat assistant' },
        { property: 'og:site_name', content: 'Kira' },
        { property: 'og:image', content: '/og-image.png' } // You should add an og-image
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,300..800&family=JetBrains+Mono:wght@400;500;600&display=swap' }
      ],
      htmlAttrs: {
        lang: 'en'
      }
    }
  },

  // Optimize build and runtime
  css: [
    // If you have global CSS files
  ],

  // Optimize modules and features
  features: {
    inlineStyles: true, // For client-side rendered apps
  },

  runtimeConfig: {
    // Private config that only the server can access
    hackclubSearchApiKey: '',
    sessionSecret: '',
    databaseUrl: '', // NUXT_DATABASE_URL / DATABASE_URL - enables accounts + cloud-synced chats
    encryptionKey: '', // NUXT_ENCRYPTION_KEY - encrypts stored API keys (falls back to sessionSecret)
    // Public config that is exposed to the client
    public: {
      // Live app version, read from package.json at build time — never
      // hardcode this in the UI.
      appVersion: pkg.version,
    }
  }
})
