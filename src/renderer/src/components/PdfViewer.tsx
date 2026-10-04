interface PdfViewerProps {
  dataUrl: string
}

/**
 * PDF preview via Chromium's built-in viewer (needs `plugins: true` in
 * webPreferences). Like images: no diff, no line-ref copy.
 */
export default function PdfViewer({ dataUrl }: PdfViewerProps): React.JSX.Element {
  return <embed className="pdf-canvas" src={dataUrl} type="application/pdf" />
}
