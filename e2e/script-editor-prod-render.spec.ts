import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 回归测试：生产 CSP 下 Rete 画布正常渲染（连线 + 节点定位 + minimap）。
 *
 * 背景：生产构建走 file://，main 进程注入严格 CSP。若 style-src 不含 'unsafe-inline'，
 * rete-react-plugin → styled-components 运行时注入的样式会被 CSP 拦截，导致：
 *   - 节点 transform 不生效（全堆在 (0,0)）
 *   - 连线 path 不渲染
 *   - minimap 位置错乱
 * 本 spec 锁住这三项在 prod 模式（fixtures 默认 SAECOM_FORCE_PROD=1）下必须正常。
 * 一旦有人移除 prod CSP 的 'unsafe-inline'，这里会红。
 */
test.describe('脚本编辑器：生产 CSP 下 Rete 渲染回归', () => {
  test('节点定位 transform 生效，连线 path 渲染', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 打开组件库，依次添加「接收串口」「发送串口」
    // input-serial 属输入类（默认展开）；output-serial 属输出类（需先展开）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.getByText('输出类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="output-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(2, { timeout: 10000 })

    // 1) 节点定位 transform 必须生效：
    //    Rete 通过运行时 inline style 给节点 view 容器设 transform: translate(...)。
    //    若被 CSP 拦截，transform 为 none，节点全部堆叠在 (0,0)。
    //    注意 transform 不在节点的直接父（<span>），而在更上层的 view 容器，需向上遍历查找。
    const nodeTransforms = await editor.locator('[data-testid="node"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        let cur = node.parentElement
        for (let i = 0; i < 6 && cur; i++) {
          const t = getComputedStyle(cur).transform
          if (t && t !== 'none') return t
          cur = cur.parentElement
        }
        return 'none'
      })
    )
    expect(nodeTransforms.length).toBe(2)
    // 每个被添加的节点都应被 Rete 定位过（transform 非 none）
    expect(nodeTransforms.every((t) => t !== 'none')).toBe(true)

    // 2) 连线 path 渲染：从 output socket 拖到 input socket 建一条连线。
    const outputSocket = editor.locator('.output-socket').first()
    const inputSocket = editor.locator('.input-socket').first()
    await outputSocket.waitFor({ timeout: 5000 })
    await inputSocket.waitFor({ timeout: 5000 })

    const outBox = await outputSocket.boundingBox()
    const inBox = await inputSocket.boundingBox()
    expect(outBox).toBeTruthy()
    expect(inBox).toBeTruthy()
    if (!outBox || !inBox) return

    await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(inBox.x + inBox.width / 2, inBox.y + inBox.height / 2, { steps: 6 })
    await page.mouse.up()

    // 连线 path：fill=none + stroke 的可见 SVG path（区别于 phosphor 图标 path，图标是 fill 填充 stroke=none）
    // CSP 拦截 styled-components 注入时，连线 path 根本不会渲染——这条断言锁住连线可见。
    await expect
      .poll(
        async () => {
          const widths = await editor.locator('path').evaluateAll((paths) =>
            paths
              .filter((p) => {
                const cs = getComputedStyle(p)
                // 连线：不填充、有描边；图标：fill 填充、stroke none
                return cs.fill === 'none' && cs.stroke !== 'none'
              })
              .map((p) => p.getBoundingClientRect().width)
              .filter((w) => w > 1) // 排除塌缩到 0 的废线
          )
          return widths.length
        },
        { timeout: 10000 }
      )
      .toBeGreaterThan(0)
  })
})
