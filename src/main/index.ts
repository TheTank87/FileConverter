import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { registerIpc } from './ipc'
import { createSettingsStore } from './settings'
import type { SettingsStore } from './settings'

const dirname = fileURLToPath(new URL('.', import.meta.url))

let mainWindow: BrowserWindow | null = null
let settingsStore: SettingsStore | null = null
let quitAfterFlush = false

function createWindow(): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: 'The Diat Converter',
    webPreferences: {
      preload: join(dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (rendererUrl !== undefined && isSameOrigin(url, rendererUrl)) return
    event.preventDefault()
  })

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(dirname, '../renderer/index.html'))
  }
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = []

  if (process.platform === 'darwin') template.push({ role: 'appMenu' })
  template.push({ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin
  } catch {
    return false
  }
}

async function bootstrap(): Promise<void> {
  settingsStore = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
  await settingsStore.load()

  registerIpc({ settings: settingsStore })
  installApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('[main] Failed to start:', error)
      app.quit()
    })
} else {
  app.quit()
}

app.on('before-quit', (event) => {
  const store = settingsStore
  if (quitAfterFlush || store === null) return

  event.preventDefault()
  quitAfterFlush = true
  void store.flush().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
