import { useState } from 'react'
import type { DragEvent } from 'react'
import { useAppStore } from '../state/store'

export function DropZone() {
  const formats = useAppStore((state) => state.formats)
  const pickAndAdd = useAppStore((state) => state.pickAndAdd)
  const addPaths = useAppStore((state) => state.addPaths)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const readable = formats
    .filter((format) => format.canRead)
    .map((format) => format.label)
    .join(', ')

  async function browse(): Promise<void> {
    if (busy) return
    setBusy(true)

    try {
      await pickAndAdd()
    } finally {
      setBusy(false)
    }
  }

  async function drop(event: DragEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault()
    setDragging(false)

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => {
        try {
          return window.api.getPathForFile(file)
        } catch {
          return ''
        }
      })
      .filter((path) => path.length > 0)

    await addPaths(paths)
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>): void {
    const next = event.relatedTarget as Node | null
    if (next === null || !event.currentTarget.contains(next)) setDragging(false)
  }

  return (
    <button
      type="button"
      className={dragging ? 'dropzone dropzone--dragging' : 'dropzone'}
      aria-label="Add image files by browsing"
      onClick={() => void browse()}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void drop(event)}
    >
      <span className="dropzone__icon" aria-hidden="true">
        ↑
      </span>
      <span className="dropzone__title">Drop files here</span>
      <span className="dropzone__hint">
        or click to browse{readable.length > 0 ? ` · ${readable}` : ''}
      </span>
    </button>
  )
}
