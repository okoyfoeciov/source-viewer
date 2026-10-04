import CustomScroll from './CustomScroll'

interface ImageViewerProps {
  fileName: string
  dataUrl: string
}

/**
 * Rendered image preview. No gutters, no line-ref copy, no diff —
 * none of those exist for pixels. Title-bar path copy still applies.
 */
export default function ImageViewer({ fileName, dataUrl }: ImageViewerProps): React.JSX.Element {
  return (
    <CustomScroll className="image-viewer">
      <div className="image-wrap">
        <img className="image-canvas" src={dataUrl} alt={fileName} draggable={false} />
      </div>
    </CustomScroll>
  )
}
