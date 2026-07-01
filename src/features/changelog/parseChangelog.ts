/**
 * CHANGELOG.md → HTML 解析器。
 *
 * 从 legacy changelog.html 内联 parseMarkdown 1:1 移植，保签名视觉特性：
 * 1. tag-badge：行首 `**FIX:**` 等关键字 → `<div class="tag-line">FIX</div>` 徽章
 * 2. version-card：以 `<h3>` 开头的段落自动包裹 `<div class="version-card">`
 *
 * 安全：解析前先对原始文本做 HTML 转义（&/</>），避免源文件中的 `<...>` 被当作标签执行；
 * 链接 URL 校验协议（仅允许 http/https/mailto），阻断 javascript: 等协议注入。
 */
const TAG_KEYWORDS =
  'FIX|UPDATE|NEW|OPTIMIZE|REMOVED|FEAT|BUG|HOTFIX|REFACTOR|PERF|STYLE|DOCS|TEST|CI|BUILD|CHORE|DEPS|SECURITY|REVERT|BREAKING|IMPROVE|TWEAK|INIT|MIGRATE'

/** HTML 转义原始文本中的危险字符（在 markdown 替换之前进行）。 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 仅放行 http(s)/mailto 协议的链接；其余（含 javascript:/data:）拒绝。 */
function isSafeUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  return /^https?:\/\//.test(u) || /^mailto:/.test(u)
}

export function parseChangelog(md: string): string {
  if (!md) return ''

  // 先转义原始文本，防止源文件里的 <script>/<...> 等被当作 HTML 执行。
  let html = escapeHtml(md)

  html = html
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')

  // 行首变更类型关键字 → 徽章（大小写不敏感）
  const tagRe = new RegExp(`^\\*\\*(${TAG_KEYWORDS}).*?\\*\\*`, 'gim')
  html = html.replace(tagRe, (_match, p1: string) => {
    return `<div class="tag-line">${p1.toUpperCase()}</div>`
  })

  html = html
    .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    // 链接：校验协议，仅安全协议渲染为 <a>，否则退化为纯文本（保留可见文字，丢弃 URL）
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, (m, text: string, url: string) =>
      isSafeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${text}</a>` : text
    )
    .replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>')

  // 列表项 → 包裹 <ul>
  html = html.replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\s*)+/gim, (m: string) => `<ul>${m}</ul>`)

  // 以 <h3> 开头的段落 → 版本卡片
  const versionBlockRegex = /(<h3>[\s\S]*?)(?=(<h3>|$))/g
  html = html.replace(versionBlockRegex, '<div class="version-card">$1</div>')

  return html
}
