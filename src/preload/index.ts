import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type ConvertRequest,
  type FileInfo,
  type FormatDef,
  type IpcChannel,
  type IpcResult,
  type JobDoneEvent,
  type ProgressEvent,
  type Settings,
  type WindowApi
} from '@shared/types'

function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

function subscribe<T>(channel: IpcChannel, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WindowApi = {
  pickFiles: () => invoke<FileInfo[]>(IPC_CHANNELS.pickFiles),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  statFiles: (paths) => invoke<FileInfo[]>(IPC_CHANNELS.statFiles, paths),
  getFormats: () => invoke<FormatDef[]>(IPC_CHANNELS.getFormats),
  pickOutputFolder: () => invoke<string | null>(IPC_CHANNELS.pickOutputFolder),
  getSettings: () => invoke<Settings>(IPC_CHANNELS.getSettings),
  setSettings: (patch) => invoke<Settings>(IPC_CHANNELS.setSettings, patch),
  startConversion: (request: ConvertRequest) =>
    invoke<{ batchId: string }>(IPC_CHANNELS.startConversion, request),
  cancelBatch: (batchId) => invoke<void>(IPC_CHANNELS.cancelBatch, batchId),
  onProgress: (callback: (event: ProgressEvent) => void) =>
    subscribe<ProgressEvent>(IPC_CHANNELS.progress, callback),
  onJobDone: (callback: (event: JobDoneEvent) => void) =>
    subscribe<JobDoneEvent>(IPC_CHANNELS.jobDone, callback),
  openPath: (path) => invoke<void>(IPC_CHANNELS.openPath, path),
  revealInFolder: (path) => invoke<void>(IPC_CHANNELS.revealInFolder, path)
}

contextBridge.exposeInMainWorld('api', api)
