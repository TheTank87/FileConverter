import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  IPC_CHANNELS,
  type ConvertError,
  type ErrorCode,
  type IpcChannel,
  type IpcResult
} from '@shared/types'
import { sanitizeSettingsPatch, type SettingsStore } from './settings'

const ERROR_CODES: readonly ErrorCode[] = [
  'UNSUPPORTED_CONVERSION',
  'UNREADABLE_FILE',
  'OUTPUT_NOT_WRITABLE',
  'ENGINE_MISSING',
  'CANCELLED',
  'UNKNOWN'
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

export function toConvertError(error: unknown): ConvertError {
  if (isConvertError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(typeof error.detail === 'string' && error.detail.length > 0
        ? { detail: error.detail }
        : {})
    }
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: error.message || 'Something went wrong.',
      detail: error.stack
    }
  }

  return { code: 'UNKNOWN', message: 'Something went wrong.', detail: String(error) }
}

export function registerIpc(deps: IpcDependencies): void {
  const registered = new Set<IpcChannel>()

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

  handle(IPC_CHANNELS.getSettings, () => deps.settings.get())
  handle(IPC_CHANNELS.setSettings, (_event, patch) =>
    deps.settings.update(sanitizeSettingsPatch(patch))
  )

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

function isConvertError(value: unknown): value is ConvertError {
  return (
    isRecord(value) &&
    isErrorCode(value.code) &&
    typeof value.message === 'string' &&
    (value.detail === undefined || typeof value.detail === 'string')
  )
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
