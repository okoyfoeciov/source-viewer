declare module 'highlight.js/lib/core' {
  export interface HLJSApi {
    getLanguage(name: string): unknown
    highlight(code: string, options: { language: string }): { value: string }
    registerLanguage(name: string, fn: (hljs: unknown) => unknown): void
  }
  const hljs: HLJSApi
  export default hljs
}

declare module 'highlight.js/lib/languages/*' {
  // highlight.js v10 ships types for the main entry but not for
  // core/lib subpaths. Language modules export one registration function.
  const language: (hljs: unknown) => unknown
  export default language
}
