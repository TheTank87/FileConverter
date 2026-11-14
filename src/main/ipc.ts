import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  FileFilter,
  IpcMainInvokeEvent,
  OpenDialogOptions,
  OpenDialogReturnValue
} from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcResult } from '@shared/types'
import { createConversionQueue } from './conversion/queue'
import { convertError, toConvertError } from './conversion/errors'
import { FORMAT_LIST, getFormats } from './conversion/formats'
import { magickEngine } from './conversion/magickEngine'
import { sharpEngine } from './conversion/sharpEngine'
import { ffmpegEngine } from './conversion/ffmpegEngine'
import { pandocEngine } from './conversion/pandocEngine'
import { statFiles } from './files'
import { sanitizeSettingsPatch, type SettingsStore } from './settings'
import { parseBatchId, parseConvertRequest, parsePath, parsePathList } from './validation'

const IMAGE_EXTENSIONS = [...new Set(FORMAT_LIST.flatMap((format) => format.extensions))]

const MEDIA_EXTENSIONS = [
  ...new Set(
    FORMAT_LIST.filter((format) => format.kind === 'audio' || format.kind === 'video').flatMap(
      (format) => format.extensions
    )
  )
]
const DOCUMENT_EXTENSIONS = [
  ...new Set(
    FORMAT_LIST.filter((format) => format.kind === 'document').flatMap(
      (format) => format.extensions
    )
  )
]

const FILE_FILTERS: FileFilter[] = [
  {
    name: 'Images, audio, video, and documents',
    extensions: [...IMAGE_EXTENSIONS, ...MEDIA_EXTENSIONS, ...DOCUMENT_EXTENSIONS]
  },
  { name: 'All Files', extensions: ['*'] }
]

export interface IpcDependencies {
  settings: SettingsStore
}

export async function ok<T>(work: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return { ok: false, error: toConvertError(error) }
  }
}

export function registerIpc(deps: IpcDependencies): void {
  const registered = new Set<IpcChannel>()
  const queue = createConversionQueue({
    engines: [sharpEngine, magickEngine, ffmpegEngine, pandocEngine],
    onProgress: (event) => broadcast(IPC_CHANNELS.progress, event),
    onJobDone: (event) => broadcast(IPC_CHANNELS.jobDone, event)
  })

  function broadcast(channel: IpcChannel, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue
      window.webContents.send(channel, payload)
    }
  }

  function handle<T>(
    channel: IpcChannel,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>
  ): void {
    registered.add(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      const result = await ok(() => handler(event, ...args))
      if (!result.ok) console.error(`[ipc] ${channel} failed:`, result.error)
      return result
    })
  }

  handle(IPC_CHANNELS.pickFiles, async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Choose images',
      properties: ['openFile', 'multiSelections'],
      filters: FILE_FILTERS
    })

    return result.canceled ? [] : statFiles(parsePathList(result.filePaths))
  })

  handle(IPC_CHANNELS.pickOutputFolder, async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Choose output folder',
      defaultPath: deps.settings.get().outputDir ?? undefined,
      properties: ['openDirectory', 'createDirectory']
    })

    const folder = result.filePaths[0]
    return result.canceled || folder === undefined ? null : parsePath(folder, 'folder')
  })

  handle(IPC_CHANNELS.statFiles, (_event, paths) => statFiles(parsePathList(paths)))
  handle(IPC_CHANNELS.getFormats, () => getFormats())

  handle(IPC_CHANNELS.getSettings, () => deps.settings.get())
  handle(IPC_CHANNELS.setSettings, (_event, patch) =>
    deps.settings.update(sanitizeSettingsPatch(patch))
  )

  handle(IPC_CHANNELS.startConversion, (_event, request) =>
    queue.start(parseConvertRequest(request))
  )
  handle(IPC_CHANNELS.cancelBatch, (_event, batchId) => {
    queue.cancel(parseBatchId(batchId))
  })

  handle(IPC_CHANNELS.openPath, async (_event, value) => {
    const path = parsePath(value)
    const error = await shell.openPath(path)
    if (error.length > 0) throw convertError('UNKNOWN', 'Could not open the file.', error)
  })

  handle(IPC_CHANNELS.revealInFolder, (_event, value) => {
    shell.showItemInFolder(parsePath(value))
  })

  registered.add(IPC_CHANNELS.progress)
  registered.add(IPC_CHANNELS.jobDone)

  if (app.isPackaged) return

  for (const channel of Object.values(IPC_CHANNELS)) {
    if (registered.has(channel)) continue

    ipcMain.handle(channel, () => {
      console.warn(`[ipc] Unhandled channel invoked: ${channel}`)
      return {
        ok: false,
        error: { code: 'UNKNOWN', message: `Channel not implemented yet: ${channel}` }
      } satisfies IpcResult<never>
    })
  }
}

async function showOpenDialog(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window === null ? dialog.showOpenDialog(options) : dialog.showOpenDialog(window, options)
}
