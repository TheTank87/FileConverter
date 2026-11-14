import { useEffect } from 'react'
import { DropZone } from './components/DropZone'
import { ErrorDetails } from './components/ErrorDetails'
import { FileList } from './components/FileList'
import { FormatPicker } from './components/FormatPicker'
import { ProgressBar } from './components/ProgressBar'
import { SettingsPanel } from './components/SettingsPanel'
import { ThemeToggle } from './components/ThemeToggle'
import { errorSentence } from './lib/errors'
import { isConvertible, selectAggregateProgress, useAppStore } from './state/store'

export function App() {
  const load = useAppStore((state) => state.load)
  const loading = useAppStore((state) => state.loading)
  const loadError = useAppStore((state) => state.loadError)
  const error = useAppStore((state) => state.error)
  const dismissError = useAppStore((state) => state.dismissError)
  const handleProgress = useAppStore((state) => state.handleProgress)
  const handleJobDone = useAppStore((state) => state.handleJobDone)
  const files = useAppStore((state) => state.files)
  const formats = useAppStore((state) => state.formats)
  const targetFormat = useAppStore((state) => state.targetFormat)
  const setTargetFormat = useAppStore((state) => state.setTargetFormat)
  const batchId = useAppStore((state) => state.batchId)
  const start = useAppStore((state) => state.start)
  const cancel = useAppStore((state) => state.cancel)
  const liveMessage = useAppStore((state) => state.liveMessage)
  const aggregate = useAppStore(selectAggregateProgress)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsubscribeProgress = window.api.onProgress(handleProgress)
    const unsubscribeJobDone = window.api.onJobDone(handleJobDone)

    return () => {
      unsubscribeProgress()
      unsubscribeJobDone()
    }
  }, [handleProgress, handleJobDone])

  const convertibleCount = files.filter((job) => isConvertible(job, formats)).length

  return (
    <div className="app">
      <header className="app__topbar">
        <h1 className="brand">
          <span className="brand__mark" aria-hidden="true">
            D
          </span>{' '}
          The Diat Converter
        </h1>
        <div className="widget-slot widget-slot--topbar" aria-hidden="true" />
        <ThemeToggle />
      </header>

      <section className="app__hero" aria-label="Add files">
        {loadError !== null && (
          <div className="banner" role="alert">
            <div className="banner__body">
              <span>Could not load the app. {errorSentence(loadError)}</span>
              <ErrorDetails error={loadError} />
            </div>
            <button type="button" className="button button--ghost" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        <DropZone />
      </section>

      <section className="app__controls" aria-label="Conversion options">
        {formats.length > 0 ? (
          <FormatPicker
            id="target-format"
            label="Convert to"
            formats={formats}
            value={targetFormat}
            onChange={setTargetFormat}
          />
        ) : (
          <p className="loading">{loading ? 'Loading formats…' : 'Formats unavailable.'}</p>
        )}
        <SettingsPanel />
      </section>

      <section className="app__list" aria-label="Files">
        <FileList />
      </section>

      <section className="app__actions" aria-label="Actions">
        {error !== null && (
          <div className="banner" role="alert">
            <div className="banner__body">
              <span>{errorSentence(error)}</span>
              <ErrorDetails error={error} />
            </div>
            <button type="button" className="button button--ghost" onClick={dismissError}>
              Dismiss
            </button>
          </div>
        )}

        {batchId !== null && (
          <ProgressBar value={aggregate} label="Overall conversion progress" showLabel large />
        )}

        {batchId !== null ? (
          <button type="button" className="button button--danger" onClick={() => void cancel()}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={convertibleCount === 0 || loading}
            onClick={() => void start()}
          >
            Convert {convertibleCount} {convertibleCount === 1 ? 'file' : 'files'}
          </button>
        )}
      </section>

      <footer className="app__footer" aria-hidden="true">
        Reserved space for future widgets
      </footer>

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>
    </div>
  )
}
