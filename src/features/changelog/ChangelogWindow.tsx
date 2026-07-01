import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import { parseChangelog } from '@/features/changelog/parseChangelog'
import './changelog.css'

/**
 * 更新日志独立窗（React 化，对应 legacy changelog.html）。
 * - 挂载时 changelog.request() 拉 CHANGELOG.md 原文，onLoad 回填
 * - 主题同步：本地设置初始化 + 监听主窗 theme.onApply，toggle dark + theme-dark
 */
function ChangelogWindow() {
  const ipc = useIPC()
  const { t } = useTranslation()
  const [html, setHtml] = useState('')
  const [loaded, setLoaded] = useState(false)

  // 跟随主窗白天/夜间：挂载时按本地设置初始化，监听主窗广播的实时切换
  useEffect(() => {
    const apply = (dark: boolean) => {
      const el = document.documentElement
      el.classList.toggle('dark', dark)
      el.classList.toggle('theme-dark', dark)
    }
    apply(useSettingsStore.getState().dark)
    return ipc.theme.onApply(({ dark }) => apply(!!dark))
  }, [ipc])

  // 拉取 changelog 内容
  useEffect(() => {
    const off = ipc.changelog.onLoad((text) => {
      setHtml(parseChangelog(text))
      setLoaded(true)
    })
    ipc.changelog.request()
    return off
  }, [ipc])

  return (
    <div className="changelog-root">
      {loaded ? (
        <div className={`changelog-content loaded`} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="changelog-placeholder">{t('changelog.placeholder')}</div>
      )}
    </div>
  )
}

export default ChangelogWindow
