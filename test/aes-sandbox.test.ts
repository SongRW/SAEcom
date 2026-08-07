/**
 * AES 沙箱能力单测（aesEncrypt / aesDecrypt）。
 *
 * 验证：
 * - 加解密往返（hex 输入 → 密文 hex → 解密还原）
 * - utf8 文本经 hex 转换后加解密往返
 * - 不同算法（aes-128-cbc / aes-256-cbc）
 * - ECB 模式（IV 忽略）
 * - 错误密钥长度抛错
 * - 错误密钥解密失败抛错
 */
import { describe, expect, it } from 'vitest'
import { aesEncrypt, aesDecrypt } from '../electron/scriptSandbox'

// AES-128-CBC：16 字节密钥 + 16 字节 IV
const KEY128 = '000102030405060708090A0B0C0D0E0F'
const IV16 = '101112131415161718191A1B1C1D1E1F'
// AES-256-CBC：32 字节密钥
const KEY256 = '000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F'

describe('aesEncrypt / aesDecrypt（hex 输入 → hex 输出）', () => {
  it('hex 明文加解密往返一致', () => {
    const plain = 'DEADBEEFCAFEBABE'  // 8 字节明文
    const enc = aesEncrypt(plain, KEY128, IV16)
    const dec = aesDecrypt(enc, KEY128, IV16)
    expect(dec).toBe(plain)
  })

  it('utf8 文本经 Buffer 加密 → 解密还原（hex 中转）', () => {
    // AES 函数以 hex 为输入/输出载体；文本需先转 hex（utf8 字节），解密后 hex 再转回文本。
    // 这里用 Node Buffer 做 hex↔utf8 转换（测试环境可用），模拟脚本侧 textToHex/hexToText。
    const text = 'SAEcom protocol payload'
    const plainHex = Buffer.from(text, 'utf8').toString('hex').toUpperCase()
    const enc = aesEncrypt(plainHex, KEY128, IV16)
    const decHex = aesDecrypt(enc, KEY128, IV16)
    const restored = Buffer.from(decHex, 'hex').toString('utf8')
    expect(restored).toBe(text)
  })

  it('空输入加解密往返（PKCS7 padding 产生 1 block 密文）', () => {
    const enc = aesEncrypt('', KEY128, IV16)
    // 空 + PKCS7 = 16 字节 padding → 密文 32 hex
    expect(enc.length).toBe(32)
    const dec = aesDecrypt(enc, KEY128, IV16)
    expect(dec).toBe('')
  })

  it('aes-256-cbc：32 字节密钥加解密往返', () => {
    const plain = 'AABBCCDDEEFF00112233445566778899'
    const enc = aesEncrypt(plain, KEY256, IV16, 'aes-256-cbc')
    const dec = aesDecrypt(enc, KEY256, IV16, 'aes-256-cbc')
    expect(dec).toBe(plain)
  })

  it('aes-128-ecb：IV 被忽略，加解密往返', () => {
    const plain = '0123456789ABCDEF'
    const enc = aesEncrypt(plain, KEY128, '', 'aes-128-ecb')
    const dec = aesDecrypt(enc, KEY128, '', 'aes-128-ecb')
    expect(dec).toBe(plain)
  })

  it('确定性：相同输入 + 密钥 + IV 产出相同密文', () => {
    const plain = '1122334455667788'
    const a = aesEncrypt(plain, KEY128, IV16)
    const b = aesEncrypt(plain, KEY128, IV16)
    expect(a).toBe(b)
  })

  it('错误密钥长度抛错（aes-128 需 16 字节）', () => {
    expect(() => aesEncrypt('ABCD', '0011', IV16)).toThrow()
  })

  it('错误密钥解密失败抛错（密文无法还原）', () => {
    const enc = aesEncrypt('DEADBEEF', KEY128, IV16)
    // 用另一个 16 字节密钥解密 → padding 失败抛错
    const wrongKey = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    expect(() => aesDecrypt(enc, wrongKey, IV16)).toThrow()
  })

  it('IV 改变则密文不同（CBC 模式依赖 IV）', () => {
    const plain = 'AABBCCDDEEFF0011'
    const ivA = '11111111111111111111111111111111'
    const ivB = '22222222222222222222222222222222'
    const encA = aesEncrypt(plain, KEY128, ivA)
    const encB = aesEncrypt(plain, KEY128, ivB)
    expect(encA).not.toBe(encB)
    // 但各自解密都能还原
    expect(aesDecrypt(encA, KEY128, ivA)).toBe(plain)
    expect(aesDecrypt(encB, KEY128, ivB)).toBe(plain)
  })
})
