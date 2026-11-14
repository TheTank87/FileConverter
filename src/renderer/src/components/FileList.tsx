import { useAppStore } from '../state/store'
import { FileRow } from './FileRow'

export function FileList() {
  const files = useAppStore((state) => state.files)
  const formats = useAppStore((state) => state.formats)

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <p>No files yet. Drop images above or click the drop area to browse.</p>
      </div>
    )
  }

  return (
    <ul className="file-list" aria-label="Files to convert">
      {files.map((job) => (
        <FileRow key={job.id} job={job} formats={formats} />
      ))}
    </ul>
  )
}
