/// <reference types="vite/client" />

interface Window {
  __FASTLINK_RUNTIME__?: Readonly<{
    environment?: string
    apiUrl?: string
    buildSha?: string
  }>
}

interface ImportMetaEnv {
  readonly VITE_FASTLINK_API_URL?: string
  readonly VITE_FASTLINK_ENVIRONMENT?: string
  readonly VITE_FASTLINK_BUILD_SHA?: string
  readonly VITE_FASTLINK_DATA_SOURCE?: 'backend' | 'mock'
  readonly PROD?: boolean
}
