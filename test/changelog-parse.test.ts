import { describe, it, expect } from 'vitest'
import { parseChangelog } from '../src/features/changelog/parseChangelog'

/**
 * 锁定 legacy changelog.html parseMarkdown 的签名视觉特性（1:1 移植）：
 * 1. 行首变更类型关键字 → tag-line 徽章
 * 2. <h3> 段落 → version-card 包裹
 * 3. bold/code/link/blockquote/li/ul 正常
 */
describe('parseChangelog', () => {
  it('空串返回空', () => {
    expect(parseChangelog('')).toBe('')
  })

  it('标题渲染 h1/h2/h3', () => {
    expect(parseChangelog('# A')).toContain('<h1>A</h1>')
    expect(parseChangelog('## B')).toContain('<h2>B</h2>')
    expect(parseChangelog('### C')).toContain('<h3>C</h3>')
  })

  it('行首变更关键字 → tag-line 徽章（大小写不敏感）', () => {
    expect(parseChangelog('**FIX:** 修复 X')).toContain('<div class="tag-line">FIX</div>')
    expect(parseChangelog('**update:** 改进 Y')).toContain('<div class="tag-line">UPDATE</div>')
    expect(parseChangelog('**New:** 新增 Z')).toContain('<div class="tag-line">NEW</div>')
    // 非关键字保留为粗体（不转徽章）
    expect(parseChangelog('**冬季特效:** foo')).not.toContain('class="tag-line"')
    expect(parseChangelog('**冬季特效:** foo')).toContain('<b>冬季特效:</b>')
  })

  it('bold / code / link / blockquote', () => {
    expect(parseChangelog('**粗**')).toContain('<b>粗</b>')
    expect(parseChangelog('`码`')).toContain('<code>码</code>')
    expect(parseChangelog('[文](https://a.com)')).toContain(
      '<a href="https://a.com" target="_blank" rel="noopener">文</a>'
    )
    expect(parseChangelog('> 引')).toContain('<blockquote>引</blockquote>')
  })

  it('列表项包裹 ul', () => {
    const out = parseChangelog('- a\n- b')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>a</li>')
    expect(out).toContain('<li>b</li>')
  })

  it('h3 段落 → version-card 包裹', () => {
    const out = parseChangelog('### Ver.0.6.1\n**FIX:** x\n- 修复 A')
    expect(out).toContain('<div class="version-card">')
    expect(out).toContain('<h3>Ver.0.6.1</h3>')
  })

  it('多个版本各自成卡片', () => {
    const md = '### Ver.0.6.1\n- a\n### Ver.0.6.0\n- b'
    const out = parseChangelog(md)
    const cardCount = (out.match(/<div class="version-card">/g) || []).length
    expect(cardCount).toBe(2)
  })
})
