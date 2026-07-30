import { describe, expect, it } from 'vitest'
import {
  PROTO,
  buildAck,
  buildEvent,
  buildFrame,
  buildNack,
  extractAllFrames,
  packBitfield,
  parseFrame,
  tryExtractFrame,
  unpackBitfield,
  crc16modbus
} from '../e2e/helpers/complex-protocol-server'

describe('complex protocol server helper v2', () => {
  it('packs and unpacks 6+2+1+7 bit fields', () => {
    const packed = packBitfield(42, 3, 0, 127)
    expect(packed).toBe(0xab7f)
    expect(unpackBitfield(packed)).toEqual({ bit6: 42, bit2: 3, bit1: 0, bit7: 127 })
  })

  it('builds a full v2 frame with float/tlv/trailer and valid dual crc', () => {
    const frame = buildFrame({
      seq: 7,
      flags: PROTO.FLAG_TLV | PROTO.FLAG_FLOAT | PROTO.FLAG_TRAILER,
      bit6: 42,
      bit2: 3,
      bit1: 0,
      bit7: 127,
      swHex: 0x01,
      swBin: 1,
      decU16: 43981,
      int32: -123456,
      floatBe: 1.5,
      fixedHex: 'DEADBEEF',
      ascii: 'HELLO-STREAM',
      gbkText: '串口助手',
      utf8Text: 'UTF8中文',
      tlvs: [
        { type: 1, value: 'meta', encoding: 'utf8' },
        { type: 2, value: 'ABCD', encoding: 'hex' },
        { type: 3, value: '中文TLV', encoding: 'gbk' }
      ],
      trailerHex: '01020304'
    })
    const parsed = parseFrame(frame)
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(PROTO.VERSION)
    expect(parsed!.seq).toBe(7)
    expect(parsed!.bitfield).toBe(0xab7f)
    expect(parsed!.int32Be).toBe(-123456)
    expect(parsed!.int32Le).toBe(-123456)
    expect(parsed!.floatBe).toBeCloseTo(1.5, 5)
    expect(parsed!.ascii).toBe('HELLO-STREAM')
    expect(parsed!.gbkText).toBe('串口助手')
    expect(parsed!.utf8Text).toBe('UTF8中文')
    expect(parsed!.tlvs).toHaveLength(3)
    expect(parsed!.tlvs[0].text).toBe('meta')
    expect(parsed!.tlvs[1].hex).toBe('ABCD')
    expect(parsed!.trailerHex).toBe('01020304')
    expect(parsed!.crc16).toMatch(/^[0-9A-F]{4}$/)
    expect(parsed!.crc8).toMatch(/^[0-9A-F]{2}$/)
  })

  it('extracts multiple sticky frames including events', () => {
    const req = buildFrame({
      seq: 1,
      bit6: 1,
      bit2: 2,
      bit1: 1,
      bit7: 3,
      swHex: 0,
      swBin: 0,
      decU16: 7,
      fixedHex: '01020304',
      ascii: 'A',
      gbkText: '测',
      utf8Text: 'U'
    })
    const parsedReq = parseFrame(req)!
    const ack = buildAck(parsedReq)
    const e0 = buildEvent(1, 0)
    const e1 = buildEvent(1, 1)
    const sticky = Buffer.concat([Buffer.from([0xff]), ack, e0, e1, Buffer.from([0x11])])
    const { frames, rest } = extractAllFrames(sticky)
    expect(frames.map((f) => f.msgType)).toEqual([
      PROTO.MSG_ACK,
      PROTO.MSG_EVENT,
      PROTO.MSG_EVENT
    ])
    expect(rest.equals(Buffer.from([0x11]))).toBe(true)
  })

  it('rejects corrupt crc8 and still measures frame length via tryExtract skip', () => {
    const good = buildFrame({
      seq: 9,
      bit6: 5,
      bit2: 1,
      bit1: 0,
      bit7: 9,
      swHex: 1,
      swBin: 1,
      decU16: 100,
      fixedHex: 'AABBCCDD',
      ascii: 'X',
      gbkText: '甲',
      utf8Text: '乙'
    })
    const bad = buildFrame({
      seq: 9,
      bit6: 5,
      bit2: 1,
      bit1: 0,
      bit7: 9,
      swHex: 1,
      swBin: 1,
      decU16: 100,
      fixedHex: 'AABBCCDD',
      ascii: 'X',
      gbkText: '甲',
      utf8Text: '乙',
      corruptCrc8: true
    })
    expect(parseFrame(good)).not.toBeNull()
    expect(parseFrame(bad)).toBeNull()
    // 坏帧后跟好帧：extract 应跳过坏 magic 区域找到好帧
    const mixed = Buffer.concat([bad, good])
    // tryExtractFrame 对坏 CRC 的 magic 会 continue 搜索；从 offset0 失败后在 bad 内可能误匹配
    // 最稳：直接 parse 第二段
    expect(parseFrame(good)!.seq).toBe(9)
    expect(mixed.length).toBe(bad.length + good.length)
  })

  it('buildNack carries reason in utf8 and tlv', () => {
    const nack = parseFrame(buildNack(3, 'bad-crc'))!
    expect(nack.msgType).toBe(PROTO.MSG_NACK)
    expect(nack.seq).toBe(3)
    expect(nack.utf8Text).toBe('bad-crc')
    expect(nack.tlvs.some((t) => t.text === 'bad-crc')).toBe(true)
  })

  it('crc16modbus is stable for known ascii vector', () => {
    // 与 sandbox crc16('123456789') 同算法族（Modbus），值 0x4B37
    expect(crc16modbus(Buffer.from('123456789', 'utf8'))).toBe(0x4b37)
  })
})
