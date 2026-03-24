// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      signalingUrl: process.env.NUXT_PUBLIC_SIGNALING_URL || 'ws://localhost:3005',
    },
  },
})
