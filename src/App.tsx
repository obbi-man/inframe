import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type TargetId = 'premiere' | 'aftereffects' | 'resolve' | 'capcut'

const TARGETS: Array<{ id: TargetId; name: string; hint: string }> = [
  { id: 'premiere', name: 'Premiere Pro', hint: 'Inbox + JSX импорт' },
  { id: 'aftereffects', name: 'After Effects', hint: 'Скрипт импорта' },
  { id: 'resolve', name: 'DaVinci Resolve', hint: 'Авто в Media Pool' },
  { id: 'capcut', name: 'CapCut', hint: 'Папка медиа' },
]

type Plugin = {
  id: string
  name: string
  apps: string[]
  category: string
  description: string
  url: string
  downloadUrl: string
}

type PageImage = {
  url: string
  width: number
  height: number
  alt: string
  kind?: 'image' | 'video'
  poster?: string
}

type Toast = { type: string; message: string; detail?: string }

export default function App() {
  const [draftUrl, setDraftUrl] = useState('https://www.pexels.com/')
  const [loading, setLoading] = useState(false)
  const [targets, setTargets] = useState<TargetId[]>([
    'premiere',
    'aftereffects',
    'resolve',
    'capcut',
  ])
  const [installed, setInstalled] = useState<Record<string, boolean>>({})
  const [inbox, setInbox] = useState('')
  const [tab, setTab] = useState<'plugins' | 'scan'>('plugins')
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [images, setImages] = useState<PageImage[]>([])
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [filterApp, setFilterApp] = useState<string>('all')

  useEffect(() => {
    window.inframe.setLayout({ left: 340, top: 56 })
    void window.inframe.getState().then((state) => {
      setDraftUrl(state.url)
      setTargets(state.targets as TargetId[])
      setInstalled(state.installed)
      setInbox(state.inbox)
    })
    void window.inframe.getPlugins().then(setPlugins)

    const offUrl = window.inframe.onBrowserUrl((next) => {
      setDraftUrl(next)
    })
    const offLoading = window.inframe.onBrowserLoading(setLoading)
    const offToast = window.inframe.onToast((payload) => {
      setToast(payload)
      window.setTimeout(() => setToast(null), 5200)
    })
    return () => {
      offUrl()
      offLoading()
      offToast()
    }
  }, [])

  const filteredPlugins = useMemo(() => {
    if (filterApp === 'all') return plugins
    return plugins.filter((p) => p.apps.includes(filterApp))
  }, [plugins, filterApp])

  async function onSubmitUrl(event: FormEvent) {
    event.preventDefault()
    const next = await window.inframe.navigate(draftUrl)
    setDraftUrl(next)
  }

  async function toggleTarget(id: TargetId) {
    const next = targets.includes(id)
      ? targets.filter((t) => t !== id)
      : [...targets, id]
    const safe = next.length ? next : targets
    setTargets(safe)
    await window.inframe.setTargets(safe)
  }

  async function scanPage() {
    setTab('scan')
    setScanning(true)
    try {
      const found = await window.inframe.scanImages()
      setImages(found)
    } finally {
      setScanning(false)
    }
  }

  async function insert(imageUrl: string) {
    await window.inframe.insertImage(imageUrl)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            In<span>Frame</span>
          </div>
          <div className="brand-tag">helper монтажёра</div>
        </div>

        <div className="nav-cluster">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="icon-btn" onClick={() => void window.inframe.goBack()} title="Назад">
              ←
            </button>
            <button className="icon-btn" onClick={() => void window.inframe.goForward()} title="Вперёд">
              →
            </button>
            <button className="icon-btn" onClick={() => void window.inframe.reload()} title="Обновить">
              ↻
            </button>
            <div className={`loading-dot ${loading ? 'on' : ''}`} />
          </div>
          <form className="url-form" onSubmit={onSubmitUrl}>
            <input
              className="url-input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="URL или поиск…"
              spellCheck={false}
            />
            <button className="ghost-btn" type="submit">
              Go
            </button>
          </form>
          <div className="top-actions">
            <button className="ghost-btn" onClick={() => void scanPage()}>
              Сканировать
            </button>
            <button className="primary-btn" onClick={() => void window.inframe.openInbox()}>
              Inbox
            </button>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <section className="panel">
          <h2>Куда вставлять</h2>
          <p className="lead">
            Наведите на картинку или видео в браузере и нажмите «Вставить» — файл уйдёт во все
            выбранные программы.
          </p>
          <div className="targets">
            {TARGETS.map((t) => {
              const active = targets.includes(t.id)
              return (
                <button
                  key={t.id}
                  className={`target ${active ? 'active' : ''}`}
                  onClick={() => void toggleTarget(t.id)}
                >
                  <span className={`dot ${installed[t.id] ? 'on' : ''}`} />
                  <span>
                    <div className="target-name">{t.name}</div>
                    <div className="target-meta">{t.hint}</div>
                  </span>
                  <span className="target-meta">{active ? 'ON' : 'OFF'}</span>
                </button>
              )
            })}
          </div>
          {inbox ? (
            <p className="lead" style={{ marginTop: 10, marginBottom: 0 }}>
              Папка: {inbox}
            </p>
          ) : null}
        </section>

        <section className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="tabs">
            <button
              className={`tab ${tab === 'plugins' ? 'active' : ''}`}
              onClick={() => setTab('plugins')}
            >
              Плагины
            </button>
            <button className={`tab ${tab === 'scan' ? 'active' : ''}`} onClick={() => void scanPage()}>
              Медиа
            </button>
          </div>

          {tab === 'plugins' ? (
            <>
              <div className="chip-row">
                {['all', 'premiere', 'aftereffects', 'resolve', 'capcut'].map((id) => (
                  <button
                    key={id}
                    className="chip"
                    style={{
                      border: '1px solid var(--line)',
                      background:
                        filterApp === id ? 'rgba(232,160,69,0.16)' : 'rgba(232,210,170,0.08)',
                      color: 'inherit',
                    }}
                    onClick={() => setFilterApp(id)}
                  >
                    {id === 'all' ? 'Все' : id}
                  </button>
                ))}
              </div>
              <div className="scroll-block">
                {filteredPlugins.map((plugin) => (
                  <article key={plugin.id} className="plugin-card">
                    <h3>{plugin.name}</h3>
                    <p>{plugin.description}</p>
                    <div className="chip-row">
                      <span className="chip">{plugin.category}</span>
                      {plugin.apps.map((app) => (
                        <span key={app} className="chip">
                          {app}
                        </span>
                      ))}
                    </div>
                    <div className="row-actions">
                      <button
                        className="primary-btn"
                        onClick={() => void window.inframe.openPluginInBrowser(plugin.downloadUrl)}
                      >
                        Открыть
                      </button>
                      <button
                        className="ghost-btn"
                        onClick={() => void window.inframe.openExternal(plugin.url)}
                      >
                        В системе
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="scroll-block">
              {scanning ? <p className="lead">Ищу картинки и видео на странице…</p> : null}
              {!scanning && images.length === 0 ? (
                <p className="lead">Нажмите «Сканировать», чтобы собрать медиа со страницы.</p>
              ) : null}
              <div className="image-grid">
                {images.map((img) => (
                  <button key={img.url} className="image-tile" onClick={() => void insert(img.url)}>
                    <img
                      src={img.poster || img.url}
                      alt={img.alt || 'media'}
                      loading="lazy"
                    />
                    <span>{img.kind === 'video' ? 'Видео →' : 'Вставить'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </aside>

      <main className="browser-stage" aria-label="Browser surface" />

      {toast ? (
        <div className={`toast ${toast.type}`}>
          <strong>{toast.message}</strong>
          {toast.detail ? <small>{toast.detail}</small> : null}
        </div>
      ) : null}
    </div>
  )
}
