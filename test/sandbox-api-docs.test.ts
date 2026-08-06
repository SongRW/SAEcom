import { describe, expect, it } from 'vitest'
import {
  SANDBOX_API_DOCS,
  getSandboxApiDoc
} from '@/features/script-editor/nodes/component/sandboxApiDocs'
import {
  SANDBOX_API_CATALOG
} from '@/features/script-editor/nodes/component/sandboxCatalog'

describe('sandboxApiDocs 元数据（单一来源）', () => {
  it('每个文档 API 都在白名单内（文档不引用未开放 API）', () => {
    const whitelist = new Set<string>(SANDBOX_API_CATALOG)
    for (const doc of SANDBOX_API_DOCS) {
      expect(whitelist.has(doc.name), `${doc.name} 应在白名单`).toBe(true)
    }
  })

  it('无重名文档', () => {
    const names = SANDBOX_API_DOCS.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('必填字段齐全（name/category/summary/signature）', () => {
    for (const doc of SANDBOX_API_DOCS) {
      expect(doc.name, 'name').toBeTruthy()
      expect(doc.category, `${doc.name} category`).toBeTruthy()
      expect(doc.summary, `${doc.name} summary`).toBeTruthy()
      expect(doc.signature, `${doc.name} signature`).toBeTruthy()
    }
  })

  it('覆盖常用 API（send/sleep/waitOnePacket/crc16/bytesToNumber）', () => {
    for (const name of ['send', 'sleep', 'waitOnePacket', 'crc16', 'bytesToNumber', 'listenSerialPackets']) {
      expect(getSandboxApiDoc(name), name).toBeDefined()
    }
  })

  it('未收录的 API 返回 undefined（查询不炸）', () => {
    expect(getSandboxApiDoc('no-such-api')).toBeUndefined()
  })
})
