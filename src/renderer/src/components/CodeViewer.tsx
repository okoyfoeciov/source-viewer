import SyntaxHighlighter from 'react-syntax-highlighter'
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import CustomScroll from './CustomScroll'

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

interface CodeViewerProps {
  fileName: string
  content: string
}

export default function CodeViewer({ fileName, content }: CodeViewerProps): React.JSX.Element {
  return (
    <CustomScroll className="code-viewer">
      <SyntaxHighlighter
        language={detectLanguage(fileName)}
        style={vs2015}
        showLineNumbers
        customStyle={{ margin: 0, background: 'transparent', padding: '12px 0 24px' }}
        codeTagProps={{
          style: {
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: 14,
            lineHeight: 1.6
          }
        }}
        lineNumberStyle={{ color: '#5a5a5a', minWidth: '3.5em', paddingRight: '1.2em' }}
      >
        {content}
      </SyntaxHighlighter>
    </CustomScroll>
  )
}
