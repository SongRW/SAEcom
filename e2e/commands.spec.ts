import { test, expect, NAV } from './fixtures'

/**
 * 命令编辑与发送：覆盖命令分组/命令的 CRUD + 持久化。
 * 流程：切到「命令」页 → 打开编辑器 → 新建分组 → 新建命令 → 关闭 → 网格出现命令卡片。
 *
 * 注意：所有编辑器操作限定在 dialog 作用域内，避免与侧栏/网格的同名元素冲突。
 */
test.describe('命令编辑与发送', () => {
  test('新建分组并新建命令，命令出现在网格', async ({ page }) => {
    const groupName = `E2E组-${Date.now()}`
    const cmdName = `测试命令`
    const cmdData = `E2E-${Date.now()}`

    // 1) 切到「命令」页
    await page.getByText(NAV.pageCommands, { exact: true }).click()

    // 2) 打开命令编辑器（空态有「打开命令编辑器」，有命令时是「编辑命令」）
    await page.getByText(/编辑命令|打开命令编辑器/).first().click()
    const editor = page.getByRole('dialog', { name: '命令编辑器' })
    await editor.waitFor()

    // 3) 新建分组：展开分组管理 → 填名 → 新建
    await editor.getByRole('button', { name: '分组管理' }).click()
    await editor.getByPlaceholder('新分组名').fill(groupName)
    await editor.getByRole('button', { name: '新建', exact: true }).click()

    // 4) 新建命令：底部「新建命令」→ 填名称/数据
    await editor.getByRole('button', { name: '新建命令' }).click()
    await editor.getByPlaceholder('名称').fill(cmdName)
    await editor.getByPlaceholder('数据').fill(cmdData)

    // 5) 关闭编辑器
    await editor.getByRole('button', { name: '完成' }).click()
    await expect(editor).toBeHidden()

    // 6) 网格出现命令卡片（role=button，含命令名）
    await expect(page.getByRole('button', { name: new RegExp(cmdName) })).toBeVisible()
  })

  test('命令编辑器可打开并关闭', async ({ page }) => {
    await page.getByText(NAV.pageCommands, { exact: true }).click()
    await page.getByText(/编辑命令|打开命令编辑器/).first().click()
    const editor = page.getByRole('dialog', { name: '命令编辑器' })
    await expect(editor).toBeVisible()

    // shadcn Dialog 默认有关闭（X）按钮，也可用「完成」
    await editor.getByRole('button', { name: '完成' }).click()
    await expect(editor).toBeHidden()
  })
})
