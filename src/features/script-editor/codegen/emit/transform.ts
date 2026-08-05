import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { concatPortCount, concatPortKey } from '@/features/script-editor/rete/dynamicPorts'
import { data, delimiter, getInputVar, getInputVars, jsString, outVar, valueAsNumber, valueAsString } from '@/features/script-editor/codegen/emit/shared'

const numericOps: Record<string, string> = {
  '加': '+',
  '减': '-',
  '乘': '*',
  '除': '/',
  '取余': '%',
  '异或': '^',
  '与': '&',
  '或': '|'
}

const crcFns: Record<string, string> = {
  CRC8: 'crc8',
  CRC16: 'crc16',
  'CRC16-CCITT': 'crc16ccitt',
  CRC32: 'crc32',
  '校验和': 'checksum'
}

export function emitTransform(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const variable = outVar(node)
  ctx.varMap.set(String(node.id), variable)
  return `${indent}var ${variable} = ${expressionFor(ctx, node)};\n`
}

function expressionFor(ctx: EmitContext, node: ReteGraphNode): string {
  const config = data(node)
  const input = getInputVar(ctx, node)
  const inputs = getInputVars(ctx, node)

  switch (node.key) {
    case 'transform-hex':
      return config.direction === '文本→HEX' ? `textToHex(${input})` : `hexToText(${input})`
    case 'transform-base64':
      return config.operation === '解码' ? `atob(${input})` : `btoa(${input})`
    case 'transform-encoding':
      return `convertEncoding(${input}, ${jsString(valueAsString(config.from, 'utf8'))}, ${jsString(valueAsString(config.to, 'utf8'))})`
    case 'transform-byteorder':
      return `swapBytes(${input}, ${config.size === '4字节' ? 4 : 2})`
    case 'transform-case':
      return config.case === '转小写' ? `${input}.toLowerCase()` : `${input}.toUpperCase()`

    case 'split-delimiter':
      return `${input}.split(${jsString(delimiter(config))})`
    case 'split-length':
      return `chunkString(${input}, ${valueAsNumber(config.length, 2)})`
    case 'split-regex':
      return `${input}.match(new RegExp(${jsString(valueAsString(config.pattern))}, ${jsString(valueAsString(config.flags, 'g'))})) || []`
    case 'split-substring': {
      const start = valueAsNumber(config.start, 0)
      const end = config.end === '末尾' || config.end === undefined || config.end === '' ? `${input}.length` : valueAsNumber(config.end, 0)
      return `${input}.substring(${start}, ${end})`
    }
    case 'split-trimbytes':
      return `${input}.slice(${valueAsNumber(config.head, 0)}, ${input}.length - ${valueAsNumber(config.tail, 0)})`

    case 'numeric-base':
      return `convertBase(${input}, ${jsString(valueAsString(config.from, '十进制'))}, ${jsString(valueAsString(config.to, '十六进制'))})`
    case 'numeric-join':
      return `bytesToNumber(${input}, ${jsString(valueAsString(config.type, 'uint16'))}, ${jsString(valueAsString(config.order, '大端'))})`
    case 'numeric-calc': {
      const right = getInputVar(ctx, node, 'right', valueAsString(config.operand2, '0'))
      return `${getInputVar(ctx, node, 'left', input)} ${numericOps[valueAsString(config.operator, '加')] || '+'} ${right}`
    }
    case 'numeric-crc':
      return `${crcFns[valueAsString(config.algorithm, 'CRC16')] || 'crc16'}(${input})`
    case 'numeric-length':
      return config.type === '字节数' ? `Buffer.byteLength(${input})` : `${input}.length`

    case 'string-concat': {
      const count = concatPortCount(data(node))
      const sep = jsString(valueAsString(config.separator))
      // 无连线时 fallback 到 _last_recv（与旧版 left/right 行为一致：拼"上一次收到的数据"）
      const parts = Array.from({ length: count }, (_, i) =>
        `String(${getInputVar(ctx, node, concatPortKey(i))}||'')`)
      return parts.join(` + ${sep} + `)
    }
    case 'string-replace':
      return config.all === '否'
        ? `${input}.replace(${jsString(valueAsString(config.search))}, ${jsString(valueAsString(config.replace))})`
        : `${input}.replaceAll(${jsString(valueAsString(config.search))}, ${jsString(valueAsString(config.replace))})`
    case 'string-trim':
      if (config.position === '左侧') return `${input}.trimStart()`
      if (config.position === '右侧') return `${input}.trimEnd()`
      if (config.position === '全部') return `${input}.replace(/\\s/g, '')`
      return `${input}.trim()`
    case 'string-find':
      if (config.return === '位置索引') return `${input}.indexOf(${jsString(valueAsString(config.search))})`
      if (config.return === '匹配次数') return `(${input}.match(new RegExp(${jsString(valueAsString(config.search))}, "g")) || []).length`
      return `${input}.includes(${jsString(valueAsString(config.search))})`
    case 'string-template': {
      const template = valueAsString(config.template, '设备{1}: 值{2}, 状态{3}').replace(/\{(\d+)\}/g, (_, n) => `\${${inputs[Number(n) - 1] || '""'}}`)
      return `\`${template.replace(/`/g, '\\`')}\``
    }
    case 'string-pad': {
      const len = valueAsNumber(config.length, 2)
      const side = valueAsString(config.side, '左侧')
      const overflow = valueAsString(config.overflow, '保留原长')
      const padExpr = side === '右侧'
        ? `_s.padEnd(${len}, _c)`
        : `_s.padStart(${len}, _c)`
      const returnExpr = overflow === '截断到长度'
        ? (side === '右侧' ? `_s.slice(0, ${len})` : `_s.slice(-${len})`)
        : '_s'
      return `(() => {
  var _s = String(${input}||'');
  var _c = String(${jsString(valueAsString(config.char, '0'))}||' ').charAt(0) || ' ';
  _s = ${padExpr};
  return ${returnExpr};
})()`
    }
    case 'transform-object': {
      const rawKeys = config.keys
      const keys = Array.isArray(rawKeys) ? (rawKeys as Array<{ id: string; name: string }>) : []
      const pairs = keys
        .map((entry) => {
          const trimmed = String(entry?.name ?? '').trim()
          if (!trimmed) return null
          const val = getInputVar(ctx, node, `key_${entry.id}`, 'null')
          return `${jsString(trimmed)}: ${val}`
        })
        .filter((p): p is string => p !== null)
      return `{ ${pairs.join(', ')} }`
    }
    case 'transform-namefields': {
      // 输入是单个数组（通常来自 split-* 节点）。按位置把元素映射为带名对象。
      // 标签多于数组项 → 缺失项填 null；标签少于数组项 → 多余项丢弃。
      const rawKeys = config.keys
      const keys = Array.isArray(rawKeys) ? (rawKeys as Array<{ id: string; name: string }>) : []
      const pairs = keys
        .map((entry, index) => {
          const trimmed = String(entry?.name ?? '').trim()
          if (!trimmed) return null
          return `${jsString(trimmed)}: (${input}[${index}] == null ? null : ${input}[${index}])`
        })
        .filter((p): p is string => p !== null)
      return pairs.length > 0 ? `{ ${pairs.join(', ')} }` : `{}`
    }
    case 'script-expr': {
      // 字母序输入端口 a, b, c... 绑定为同名局部变量；表达式直接引用。
      // 例：6 输入 + 表达式 (new Date(Date.UTC(a, b-1, c, d, e, f) + 8*3600*1000)).getDate()
      const count = concatPortCount(data(node))
      const binds = Array.from({ length: count }, (_, i) => {
        const key = concatPortKey(i)
        return `var ${key} = ${getInputVar(ctx, node, key, 'null')};`
      })
      const expr = valueAsString(config.expr, '(a + b)')
      return `(() => { ${binds.join(' ')} return (${expr}); })()`
    }
    default:
      return input
  }
}
