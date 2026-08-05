import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 脚本编辑器自动排版：
 * 保持节点身份，并按 graph.nodes[] 的既有顺序排列同层节点。
 */
test.describe('脚本编辑器自动排版', () => {
  test('画布工具栏自动排版重排节点位置', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 插入顺序即 graph.nodes[] 的全局阅读顺序：a、b、d、c。
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-manual"]'))
    await clickReady(page, editor.locator('[data-node-key="input-manual"]'))
    await clickReady(page, editor.getByText('输出类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="output-log"]'))
    await clickReady(page, editor.locator('[data-node-key="output-log"]'))

    const nodes = editor.locator('[data-testid="node"]')
    await expect(nodes).toHaveCount(4, { timeout: 10000 })

    const manualNodes = editor.locator('[data-testid="node"][data-node-key="input-manual"]')
    const outputLogNodes = editor.locator('[data-testid="node"][data-node-key="output-log"]')
    const a = manualNodes.nth(0)
    const b = manualNodes.nth(1)
    const d = outputLogNodes.nth(0)
    const c = outputLogNodes.nth(1)
    const aId = await a.getAttribute('data-node-id')
    const bId = await b.getAttribute('data-node-id')
    const dId = await d.getAttribute('data-node-id')
    const cId = await c.getAttribute('data-node-id')
    expect(aId).toBeTruthy()
    expect(bId).toBeTruthy()
    expect(dId).toBeTruthy()
    expect(cId).toBeTruthy()

    const aOutput = a.getByTestId('output-out').locator('.output-socket')
    const cInput = c.getByTestId('input-in').locator('.input-socket')
    const aOutputBox = await aOutput.boundingBox()
    const cInputBox = await cInput.boundingBox()
    expect(aOutputBox).toBeTruthy()
    expect(cInputBox).toBeTruthy()
    if (!aOutputBox || !cInputBox) return

    await page.mouse.move(aOutputBox.x + aOutputBox.width / 2, aOutputBox.y + aOutputBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(cInputBox.x + cInputBox.width / 2, cInputBox.y + cInputBox.height / 2, { steps: 6 })
    await page.mouse.up()

    const bOutput = b.getByTestId('output-out').locator('.output-socket')
    const dInput = d.getByTestId('input-in').locator('.input-socket')
    const bOutputBox = await bOutput.boundingBox()
    const dInputBox = await dInput.boundingBox()
    expect(bOutputBox).toBeTruthy()
    expect(dInputBox).toBeTruthy()
    if (!bOutputBox || !dInputBox) return

    await page.mouse.move(bOutputBox.x + bOutputBox.width / 2, bOutputBox.y + bOutputBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(dInputBox.x + dInputBox.width / 2, dInputBox.y + dInputBox.height / 2, { steps: 6 })
    await page.mouse.up()

    await expect.poll(async () => {
      const widths = await editor.locator('path').evaluateAll((paths) => paths
        .filter((path) => {
          const style = getComputedStyle(path)
          return style.fill === 'none' && style.stroke !== 'none'
        })
        .map((path) => path.getBoundingClientRect().width)
        .filter((width) => width > 1)
      )
      return widths.length
    }, { timeout: 10000 }).toBe(2)

    const before = await nodes.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-node-id') || '',
        key: el.getAttribute('data-node-key') || '',
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      }
    }))
    expect(before.every((item) => item.id)).toBe(true)

    await clickReady(page, editor.getByTestId('auto-arrange'))

    const aAfter = editor.locator(`[data-testid="node"][data-node-id="${aId}"]`)
    const bAfter = editor.locator(`[data-testid="node"][data-node-id="${bId}"]`)
    const dAfter = editor.locator(`[data-testid="node"][data-node-id="${dId}"]`)
    const cAfter = editor.locator(`[data-testid="node"][data-node-id="${cId}"]`)
    const arrangedNodes = [
      { id: aId, node: aAfter },
      { id: bId, node: bAfter },
      { id: dId, node: dAfter },
      { id: cId, node: cAfter }
    ]

    // 工具栏事件不等待 arrangeLayout；以保存 ID 对应节点的实际坐标变化作为排版完成屏障。
    await expect.poll(async () => {
      const positions = await Promise.all(arrangedNodes.map(async ({ id, node }) => {
        const box = await node.boundingBox()
        return box ? { id, x: Math.round(box.x), y: Math.round(box.y) } : null
      }))
      return positions.some((position) => {
        if (!position) return false
        const prev = before.find((entry) => entry.id === position.id)
        return !!prev && (prev.x !== position.x || prev.y !== position.y)
      })
    }, { timeout: 10000 }).toBe(true)

    // 节点数量、id 与类型保持不变。
    await expect(nodes).toHaveCount(4)
    const after = await nodes.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-node-id') || '',
        key: el.getAttribute('data-node-key') || '',
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      }
    }))

    expect(after.map((item) => item.id).sort()).toEqual(before.map((item) => item.id).sort())
    expect(after.map((item) => item.key).sort()).toEqual(before.map((item) => item.key).sort())

    const aBox = await aAfter.boundingBox()
    const bBox = await bAfter.boundingBox()
    const dBox = await dAfter.boundingBox()
    const cBox = await cAfter.boundingBox()
    expect(aBox).toBeTruthy()
    expect(bBox).toBeTruthy()
    expect(dBox).toBeTruthy()
    expect(cBox).toBeTruthy()
    if (!aBox || !bBox || !dBox || !cBox) return

    expect(Math.abs(aBox.x - bBox.x)).toBeLessThan(6)
    expect(Math.abs(dBox.x - cBox.x)).toBeLessThan(6)
    expect(dBox.x).toBeGreaterThan(aBox.x + 20)
    expect(cBox.x).toBeGreaterThan(bBox.x + 20)
    expect(aBox.y).toBeLessThan(bBox.y)
    expect(dBox.y).toBeLessThan(cBox.y)
  })

  test('位域节点多字段排版后端口不溢出容器框', async ({ page }) => {
    // 回归：旧 bitfieldNodeHeight 公式只按字段数算一次端口行高度，控件部分给固定 60px，
    // 字段越多欠得越多。排版时 rete-area-plugin 的 resize 在节点根 div 写固定
    // el.style.height（覆盖 React 设的 minHeight），导致 field 端口 + footer 从容器
    // 底部溢出"挂"在节点外面。本测试断言排版后最后一个 field 端口仍在容器框内。
    //
    // 默认「打包」模式下 field_* 是输入端口（N 个）+ BitfieldControl（N 行 + footer），
    // 端口数与控件行数都随字段数累积，溢出机制与解包模式一致；保留默认模式避免额外的
    // mode 切换交互（mode select 仅在 NodeConfigPanel，画布上不渲染）。
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 添加位域节点（协议类）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('协议类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="protocol-bitfield"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="protocol-bitfield"]')
    await expect(node).toBeVisible({ timeout: 10000 })

    // 默认 1 个字段；再加 3 个，凑到 4 个字段（旧公式下溢出最明显）。
    const addBtn = node.getByTestId('bitfield-add')
    for (let i = 0; i < 3; i += 1) {
      await addBtn.click()
    }
    // 等待 4 个 field 输入端口就绪（打包模式端口 key 形如 field_f1..f4，由 setup.ts 动态生成）。
    await expect(node.locator('[data-testid^="input-field_"]')).toHaveCount(4, { timeout: 10000 })

    const nodeId = await node.getAttribute('data-node-id')
    expect(nodeId).toBeTruthy()

    await clickReady(page, editor.getByTestId('auto-arrange'))

    // 排版是异步的；以节点容器位置稳定作为完成屏障。
    const nodeAfter = editor.locator(`[data-testid="node"][data-node-id="${nodeId}"]`)
    await expect.poll(async () => {
      const box = await nodeAfter.boundingBox()
      return box ? Math.round(box.x) + Math.round(box.y) : 0
    }, { timeout: 10000 }).toBeGreaterThan(0)

    // 核心断言：容器渲染框（被 resize 写了固定 height）必须包住所有内容。
    // 取节点根 div 的 getBoundingClientRect（容器框）与最后一个 field 端口的
    // bottom 比较；端口必须在容器框内（允许 1px 取整容差）。
    const overflow = await nodeAfter.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const fieldPorts = el.querySelectorAll<HTMLElement>('[data-testid^="input-field_"]')
      const lastPort = fieldPorts[fieldPorts.length - 1]
      if (!lastPort) return { ok: true, portBottom: 0, nodeBottom: 0 }
      const portRect = lastPort.getBoundingClientRect()
      return {
        ok: portRect.bottom <= rect.bottom + 1,
        portBottom: Math.round(portRect.bottom),
        nodeBottom: Math.round(rect.bottom)
      }
    })
    expect(overflow.portBottom, '最后一个 field 端口不应低于节点容器框底部').toBeLessThanOrEqual(overflow.nodeBottom + 1)
    expect(overflow.ok).toBe(true)

    // 同时校验 footer（总位宽提示 + 添加按钮）也在容器框内。
    const footerOverflow = await nodeAfter.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const footer = el.querySelector('.script-key-list__footer')
      if (!footer) return { ok: true, footerBottom: 0, nodeBottom: 0 }
      const fr = (footer as HTMLElement).getBoundingClientRect()
      return {
        ok: fr.bottom <= rect.bottom + 1,
        footerBottom: Math.round(fr.bottom),
        nodeBottom: Math.round(rect.bottom)
      }
    })
    expect(footerOverflow.footerBottom, '位域控件 footer 不应低于节点容器框底部').toBeLessThanOrEqual(footerOverflow.nodeBottom + 1)
  })
})
