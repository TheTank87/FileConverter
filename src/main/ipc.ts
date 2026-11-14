import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcResult } from '@shared/types'
import { toConvertError } from './conversion/errors'
import { sanitizeSettingsPatch, type SettingsStore } from './settings'

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
