import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import type { AboutInfo } from '@shared/types'
import './about.css'

/** 关于信息行（对应 legacy about.html render() 的 4 行） */
interface InfoRow {
  icon: string
  label: string
  value: string
  url: string | null
}

const LINKS = {
  mail: 'mailto:satone_shichimiya@outlook.com',
  github: 'https://github.com/tylhk/SAEcom',
  blog: 'https://satone1008.cn/index.php/2025/09/16/%e6%94%af%e6%8c%81%e5%a4%9a%e7%aa%97%e5%8f%a3%e7%9b%91%e8%a7%86%e7%9a%84%e4%b8%b2%e5%8f%a3%e5%8a%a9%e6%89%8bsaecom/'
}

/**
 * 关于独立窗（React 化，对应 legacy about.html）。
 * - 挂载时 about.request() 拉系统信息，onLoad 回填
 * - 主题同步：本地设置初始化 + 监听主窗 theme.onApply
 * - 检查更新：点击后按钮 disabled + 文案「检查中…」，1500ms 后恢复（结果仅原生对话框，无 IPC 回传）
 */
function AboutWindow() {
  const ipc = useIPC()
  const { t } = useTranslation()
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 主题同步
  useEffect(() => {
    const apply = (dark: boolean) => {
      const el = document.documentElement
      el.classList.toggle('dark', dark)
      el.classList.toggle('theme-dark', dark)
    }
    apply(useSettingsStore.getState().dark)
    return ipc.theme.onApply(({ dark }) => apply(!!dark))
  }, [ipc])

  // 拉系统信息
  useEffect(() => {
    const offLoad = ipc.about.onLoad((payload) => setInfo(payload))
    ipc.about.request()
    return () => {
      offLoad()
      if (checkTimer.current) clearTimeout(checkTimer.current)
    }
  }, [ipc])

  const rows: InfoRow[] = [
    { icon: '🎅', label: t('about.author'), value: t('about.authorName'), url: null },
    { icon: '📧', label: t('about.email'), value: t('about.emailAction'), url: LINKS.mail },
    { icon: '📦', label: t('about.github'), value: t('about.githubAction'), url: LINKS.github },
    { icon: '📝', label: t('about.blog'), value: t('about.blogAction'), url: LINKS.blog }
  ]

  function openExternal(url: string) {
    ipc.shell.openExternal(url)
  }

  function handleCheckUpdate() {
    ipc.app.checkUpdate()
    setChecking(true)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(() => setChecking(false), 1500)
  }

  function handleOpenChangelog() {
    ipc.changelog.open()
  }

  return (
    <div className="about-root">
      <div className="about-content loaded">
        <div className="brand">
          <div className="brand-icon">📡</div>
          <div>
            <div className="brand-title">SAEcom</div>
            <div className="brand-version">Ver. {info?.version || '...'}</div>
          </div>
        </div>

        <div className="info-list">
          {rows.map((r) => {
            const clickable = !!r.url
            return (
              <div
                key={r.label}
                className={`info-row ${clickable ? 'clickable' : ''}`}
                onClick={clickable ? () => openExternal(r.url as string) : undefined}
              >
                <span className="info-icon">{r.icon}</span>
                <span className="info-label">{r.label}</span>
                <span className={`info-value ${clickable ? 'link' : ''}`}>{r.value}</span>
              </div>
            )
          })}
        </div>

        <div className="actions">
          <button className="btn primary" onClick={handleCheckUpdate} disabled={checking}>
            {checking ? t('about.checking') : t('about.checkUpdate')}
          </button>
          <button className="btn" onClick={handleOpenChangelog}>
            {t('about.viewChangelog')}
          </button>
        </div>

        <div className="sys-info">
          Electron {info?.electron || ''} · Chromium {info?.chrome || ''}
          <br />
          Node {info?.node || ''} · {info?.platform || ''} {info?.arch || ''}
        </div>

        <div className="copyright">{t('about.copyright')}</div>
      </div>
    </div>
  )
}

export default AboutWindow
