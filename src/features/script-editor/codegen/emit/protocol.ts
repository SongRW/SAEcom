import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { concatPortCount, concatPortKey } from '@/features/script-editor/rete/dynamicPorts'
import { data, getInputVar, jsString, outVar, valueAsNumber, valueAsString } from '@/features/script-editor/codegen/emit/shared'

/**
 * 协议类节点 codegen。
 * 运行时依赖 sandbox 的 convertBase / convertEncoding / textToHex / hexToText / crc*。
 * 输出统一为大写 HEX 字符串，便于 send(..., 'hex')。
 *
 * 输入归一化：协议节点假设输入是 HEX 字符串。但 input-* 监听节点吐出的是
 * latin1 字节串（每 char 一字节），所以接收型节点（slice/parse/decode/unpack）
 * 对输入先 textToHex 归一化。
 */

/** 接收型协议节点：把 latin1 字节串 / 文本 / 已是 hex 的输入统一成大写 HEX。 */
function normalizeHexExpr(varRef: string): string {
  return `(() => { var _s = String(${varRef}||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })()`
}

export function emitProtocol(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const variable = outVar(node)
  ctx.varMap.set(String(node.id), variable)

  // 位域解包是多输出：每个 field 产一个独立 var，必须提到外层作用域（不能用 IIFE，
  // 否则 IIFE 局部 var 在外部引用时报 ReferenceError）。故单独走多行 emit。
  if (node.key === 'protocol-bitfield') {
    const config = data(node)
    const mode = valueAsString(config.mode, '打包')
    if (mode === '解包') {
      const fields = Array.isArray(config.fields)
        ? (config.fields as Array<{ id?: string; name?: string; bits?: number }>)
            .map((f) => ({ id: String(f.id ?? ''), bits: Number(f.bits) || 0 }))
            .filter((f) => f.id && f.bits > 0)
        : []
      const totalBits = fields.reduce((sum, f) => sum + f.bits, 0)
      const hex = normalizeHexExpr(getInputVar(ctx, node, 'hex', getInputVar(ctx, node)))
      const fieldVars = fields.map((f) => `${variable}_${f.id}`)
      const nodeIdStr = String(node.id)
      fields.forEach((f, i) => {
        ctx.varMap.set(`${nodeIdStr}:field_${f.id}`, fieldVars[i])
      })
      ctx.varMap.set(`${nodeIdStr}:out`, fieldVars[0] || variable)
      ctx.varMap.set(nodeIdStr, fieldVars[0] || variable)
      let cursor = 0
      const lines: string[] = []
      // 二进制串补齐到 totalBits 位（convertBase 对 hex→二进制只 pad 到 8 位倍数，不足 totalBits）
      lines.push(`${indent}var _bin_${variable} = (function(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); })(convertBase(${hex}, '十六进制', '二进制'), ${totalBits});`)
      for (const f of fields) {
        const from = cursor
        const to = cursor + f.bits
        cursor = to
        const fv = `${variable}_${f.id}`
        lines.push(`${indent}var ${fv} = Number(convertBase(_bin_${variable}.slice(${from}, ${to}), '二进制', '十进制'));`)
      }
      // 主变量指向第一字段（保持单输出消费者兼容：_out_${id} = 第一字段值）
      lines.push(`${indent}var ${variable} = ${fieldVars[0] || '0'};`)
      return lines.join('\n') + '\n'
    }
  }

  return `${indent}var ${variable} = ${expressionFor(ctx, node)};\n`
}

function expressionFor(ctx: EmitContext, node: ReteGraphNode): string {
  const config = data(node)
  const input = getInputVar(ctx, node)
  const variable = outVar(node)

  switch (node.key) {
    case 'protocol-const': {
      const mode = valueAsString(config.mode, 'hex')
      // content 可接上游输入（如循环序列号）；无连线用配置常量
      const contentVar = getInputVar(ctx, node, 'content', '')
      const contentConnected = ctx.graph.incomingByNode.get(String(node.id))?.some(cc => cc.targetInput === 'content')
      const content = contentConnected ? contentVar : valueAsString(config.content, '')
      const contentStr = contentConnected ? `String(${contentVar})` : jsString(content)
      if (mode === 'hex') {
        if (contentConnected) return `String(${contentVar}||'').replace(/[\\s,]/g,'').toUpperCase()`
        return jsString(content.replace(/[\s,]/g, '').toUpperCase())
      }
      if (mode === 'decimal') {
        const width = valueAsNumber(config.width, 2)
        return `(() => { var _n = Number(${contentStr}); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < ${width * 2}) _h = '0' + _h; return _h.slice(-${width * 2}); })()`
      }
      if (mode === 'binary') {
        const width = valueAsNumber(config.width, 2)
        return `(() => { var _d = convertBase(${contentStr}, '二进制', '十进制'); var _h = convertBase(String(_d), '十进制', '十六进制').toUpperCase(); while (_h.length < ${width * 2}) _h = '0' + _h; return _h.slice(-${width * 2}); })()`
      }
      // text → utf8/gbk/latin1 字节再转 hex
      // 注意：textToHex 按 charCode 编码（UCS-2），对中文会产出错误字节。
      // 必须先 convertEncoding 到「字节袋」编码（每 char 一字节），再 textToHex。
      // - utf8: 转 latin1（字节袋），textToHex 得到真实 UTF-8 字节
      // - gbk: 转 gbk（字节袋），textToHex 得到 GBK 字节
      // - latin1: 同 utf8 路径
      const enc = valueAsString(config.encoding, 'utf8')
      if (enc === 'utf8' || enc === 'latin1') {
        return `textToHex(convertEncoding(${contentStr}, 'utf8', 'latin1')).toUpperCase()`
      }
      if (enc === 'gbk') {
        return `textToHex(convertEncoding(${contentStr}, 'utf8', 'gbk')).toUpperCase()`
      }
      return `textToHex(${contentStr}).toUpperCase()`
    }

    case 'protocol-bitfield': {
      // 通用位域打包：fields 由用户配置驱动（默认中性：单 8 位字段）。
      // 总位宽 ≤ 32（convertBase 底层 parseInt 32bit 精度限制）。
      // 解包模式（多输出）在 emitProtocol 单独处理，不走这里。
      const fields = Array.isArray(config.fields)
        ? (config.fields as Array<{ id?: string; name?: string; bits?: number }>)
            .map((f) => ({ id: String(f.id ?? ''), bits: Number(f.bits) || 0 }))
            .filter((f) => f.id && f.bits > 0)
        : []
      const totalBits = fields.reduce((sum, f) => sum + f.bits, 0)
      const totalHexChars = Math.ceil(totalBits / 8) * 2
      // 打包：按 fields 顺序拼接二进制 → hex（单输出 _out_${id}）
      const partExprs = fields.map((f) => {
        const v = getInputVar(ctx, node, `field_${f.id}`, '0')
        return `_pad(convertBase(String(${v}||0), '十进制', '二进制'), ${f.bits})`
      })
      return `(() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var bin = ${partExprs.length ? partExprs.join(' + ') : "''"};
  var d = convertBase(bin || '0', '二进制', '十进制');
  return _pad(convertBase(String(d), '十进制', '十六进制'), ${totalHexChars || 2}).toUpperCase();
})()`
    }

    case 'protocol-concat': {
      const count = concatPortCount(data(node))
      const parts = Array.from({ length: count }, (_, i) =>
        `String(${getInputVar(ctx, node, concatPortKey(i), '""')}||'')`)
      return `(${parts.join(' + ')}).toUpperCase().replace(/\\s/g,'')`
    }

    case 'protocol-len-prefix': {
      const body = getInputVar(ctx, node, 'body', input)
      const width = valueAsString(config.width, 'u8') === 'u16' ? 2 : 1
      return `(() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(${body}||'').replace(/\\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), ${width * 2}).toUpperCase();
  return lenHex + body;
})()`
    }

    case 'protocol-crc': {
      const body = getInputVar(ctx, node, 'body', input)
      const algo = valueAsString(config.algorithm, 'CRC16')
      const fn = algo === 'CRC8' ? 'crc8' : algo === 'CRC32' ? 'crc32' : algo === '校验和' ? 'checksum' : 'crc16'
      const append = valueAsString(config.append, '是') === '是'
      const endian = valueAsString(config.endian, '小端')
      if (fn === 'crc16') {
        return `(() => {
  var body = String(${body}||'').replace(/\\s/g,'').toUpperCase();
  var c = String(${fn}(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = ${endian === '小端' ? 'c.substr(2,2)+c.substr(0,2)' : 'c'};
  return ${append ? 'body + out' : 'out'};
})()`
      }
      return `(() => {
  var body = String(${body}||'').replace(/\\s/g,'').toUpperCase();
  var c = String(${fn}(body)).toUpperCase();
  if (c.length % 2) c = '0' + c;
  return ${append ? 'body + c' : 'c'};
})()`
    }

    case 'protocol-slice': {
      // 接收型：输入可能是 latin1 字节串，归一化成 hex
      const hex = normalizeHexExpr(getInputVar(ctx, node, 'hex', input))
      // start/length 优先用连线输入（动态拆帧），无连线用配置常量
      const startExpr = getInputVar(ctx, node, 'start', String(valueAsNumber(config.start, 0)))
      const lengthExpr = getInputVar(ctx, node, 'length', String(valueAsNumber(config.length, 2)))
      return `(() => {
  var _h = ${hex};
  var _s = Math.max(0, parseInt(${startExpr}) || 0) * 2;
  var _l = Math.max(0, parseInt(${lengthExpr}) || 0) * 2;
  return _h.substr(_s, _l);
})()`
    }

    case 'protocol-parse-u': {
      const hex = normalizeHexExpr(getInputVar(ctx, node, 'hex', input))
      const width = valueAsNumber(config.width, 2)
      const endian = valueAsString(config.endian, '大端')
      return `(() => {
  var h = ${hex};
  var chunk = h.substr(0, ${width * 2});
  while (chunk.length < ${width * 2}) chunk = '0' + chunk;
  ${endian === '小端' ? `chunk = chunk.match(/.{2}/g).reverse().join('');` : ''}
  return Number(convertBase(chunk, '十六进制', '十进制'));
})()`
    }

    case 'protocol-decode-text': {
      const hex = normalizeHexExpr(getInputVar(ctx, node, 'hex', input))
      const enc = valueAsString(config.encoding, 'utf8')
      if (enc === 'gbk') {
        return `convertEncoding(hexToText(${hex}), 'gbk', 'utf8')`
      }
      if (enc === 'latin1' || enc === 'utf8') {
        return `convertEncoding(hexToText(${hex}), 'latin1', 'utf8')`
      }
      return `hexToText(${hex})`
    }

    default:
      return input
  }
}
