import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../src/features/script-editor/script-editor.css'), 'utf8')

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  return match?.[1] ?? ''
}

describe('script editor css', () => {
  it('keeps inspector select rows inside narrow parameter panels', () => {
    expect(ruleFor('.script-editor-field')).toContain('min-width: 0')
    expect(ruleFor('.script-editor-field__select-row')).toContain('min-width: 0')
    expect(ruleFor('.script-editor-field__select')).toContain('min-width: 0')
    expect(ruleFor('.script-editor-field__select > span:first-child')).toContain('text-overflow: ellipsis')
    expect(ruleFor('.script-editor-field__refresh')).toContain('width: 34px !important')
    expect(ruleFor('.script-editor-field__refresh')).toContain('min-height: 34px !important')
    expect(ruleFor('.script-editor-select-content')).toContain('max-width: min')
    expect(ruleFor('.script-editor-select-option span')).toContain('white-space: normal')
  })
})
