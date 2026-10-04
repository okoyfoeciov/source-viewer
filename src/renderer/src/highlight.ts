import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import less from 'highlight.js/lib/languages/less'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import php from 'highlight.js/lib/languages/php'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import dockerfile from 'highlight.js/lib/languages/dockerfile'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('less', less)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('java', java)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('php', php)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('dockerfile', dockerfile)

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  html: 'xml',
  xml: 'xml',
  vue: 'xml',
  svelte: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  java: 'java',
  c: 'c',
  h: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  dockerfile: 'dockerfile'
}

export function detectLanguage(fileName: string): string {
  const base = fileName.toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  const dot = base.lastIndexOf('.')
  if (dot === -1) return 'plaintext'
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1)] ?? 'plaintext'
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function closeTag(openTag: string): string {
  const name = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(openTag)?.[1] ?? 'span'
  return `</${name}>`
}

/**
 * Split highlighted HTML (hljs emits <span> trees) into one balanced
 * HTML string per line: open spans are closed at each newline and
 * reopened on the next line, so every line is self-contained.
 */
export function splitBalanced(html: string): string[] {
  const lines: string[] = []
  const stack: string[] = []
  let cur = ''
  const endLine = (): void => {
    cur += stack
      .slice()
      .reverse()
      .map(closeTag)
      .join('')
    lines.push(cur)
    cur = stack.join('')
  }
  const token = /(<\/?span[^>]*>)|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = token.exec(html)) !== null) {
    const tag = m[1]
    const text = m[2]
    if (tag) {
      if (tag.startsWith('</')) stack.pop()
      else stack.push(tag)
      cur += tag
    } else if (text) {
      const parts = text.split('\n')
      cur += parts[0]
      for (let i = 1; i < parts.length; i++) {
        endLine()
        cur += parts[i]
      }
    }
  }
  endLine()
  return lines
}

const MAX_HIGHLIGHT_BYTES = 256 * 1024

function expectedLines(code: string): string[] {
  const parts = code.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '' && code.endsWith('\n')) parts.pop()
  return parts
}

/**
 * Highlight whole code (correct multi-line tokens), return one balanced
 * HTML string per source line. Falls back to escaped plain text for
 * unknown languages, oversized input, or highlighter errors.
 */
export function highlightLines(code: string, language: string): string[] {
  const plain = expectedLines(code).map(escapeHtml)
  if (code.length > MAX_HIGHLIGHT_BYTES || !hljs.getLanguage(language)) return plain
  let html: string
  try {
    html = hljs.highlight(code, { language }).value
  } catch {
    return plain
  }
  const lines = splitBalanced(html)
  while (lines.length < plain.length) lines.push('')
  return lines.slice(0, plain.length)
}
