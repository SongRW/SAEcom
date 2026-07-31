// One-shot rewriter: collapses the 6 separate time logs (年/月/日/时/分/秒)
// in the two protocol visual scripts into a single yyyy-mm-dd hh:mm:ss log line,
// using ONLY native editor nodes (string-concat / split-trimbytes / numeric-calc / string-template).
//
// Run: node scripts/rewrite-time-format.mjs
// Re-run-safe: detects an already-merged graph and skips it.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = path.join(__dirname, '..', 'shared', 'samples')
const TEST_DIR = path.join(__dirname, '..', 'test')

const FLOW_START_MARKER = 'VS_FLOW_START'
const FLOW_END_MARKER = 'VS_FLOW_END'

// ---- helpers --------------------------------------------------------------

/** Parse a .js visual-script file into { graph, tail } preserving the file tail. */
function parseVisualScript(source) {
  const startIndex = source.indexOf(FLOW_START_MARKER)
  const endIndex = source.lastIndexOf(FLOW_END_MARKER)
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error('missing VS_FLOW markers')
  }
  const jsonText = source.slice(startIndex + FLOW_START_MARKER.length, endIndex).trim()
  const graph = JSON.parse(jsonText)
  const tail = source.slice(endIndex + FLOW_END_MARKER.length)
  return { graph, tail }
}

/** Rebuild a .js visual-script file from a graph + the original tail.
 *  tail is everything after VS_FLOW_END, so it starts with the original block
 *  comment closer. We strip that leading closer (we re-add our own) to avoid a
 *  doubled comment terminator. */
function buildVisualScript(graph, tail) {
  const before = `// @sample-version 6\n/* ${FLOW_START_MARKER}\n`
  const json = JSON.stringify(graph, null, 2)
  const after = `\n${FLOW_END_MARKER} */`
  // Strip a leading comment-closer that the original tail carried.
  const cleanTail = tail.replace(/^\s*\*\/\s*/, '')
  return before + json + after + cleanTail
}

const asArr = (x) => (Array.isArray(x) ? x : x ? Object.values(x) : [])

/** Find a node by id. */
const nodeById = (graph, id) => asArr(graph.nodes).find((n) => String(n.id) === String(id))

/** Find an output-log node whose prefix matches. */
const findLogByPrefix = (graph, prefix) =>
  asArr(graph.nodes).find((n) => n.key === 'output-log' && (n.data || {}).prefix === prefix)

/** Find the parse-u node feeding an output-log node (log.in -> parse-u.out). */
const findSourceParseU = (graph, logNode) => {
  const conns = asArr(graph.connections)
  const inc = conns.find(
    (c) => String(c.target) === String(logNode.id) && c.targetInput === 'in'
  )
  if (!inc) return null
  const src = nodeById(graph, inc.source)
  return src && src.key === 'protocol-parse-u' ? src : null
}

/** Remove a node and every connection touching it. */
function removeNode(graph, id) {
  graph.nodes = asArr(graph.nodes).filter((n) => String(n.id) !== String(id))
  graph.connections = asArr(graph.connections).filter(
    (c) => String(c.source) !== String(id) && String(c.target) !== String(id)
  )
}

// ---- builder for the merged time graph ------------------------------------

/**
 * Build the time-format subgraph using native nodes only.
 *
 * Layout (per field 月/日/时/分/秒): pad2 = "0" + value via string-concat, then
 *   slice(-2) via split-trimbytes(head:-2, tail:0).
 * Year: numeric-calc(加, 2000) → already 4-digit (e.g. 2026).
 * Assembly: string-template `{1}-{2}-{3} {4}:{5}:{6}` (3 inputs, used in two stages).
 *
 * @param parseVarByField  map: field('年'|'月'...) -> source parse-u node id
 * @param baseId           first free node id to allocate from
 * @returns { nodes, connections, nextId, finalLogId }
 */
function buildTimeSubgraph(parseVarByField, baseId) {
  let id = baseId
  const nodes = []
  const conns = []
  const nextId = () => String(id++)
  // keep ids stable/ordered: pad nodes first, then assembly, then log.

  const padNodes = {} // field -> concat node id (the padded 2-digit value source)

  // 0-prefix constant per padded field
  for (const field of ['月', '日', '时', '分', '秒']) {
    const zero = { id: nextId(), key: 'input-manual', position: { x: 1180, y: 0 }, data: { content: '0', mode: 'text' } }
    const concat = { id: nextId(), key: 'string-concat', position: { x: 1380, y: 0 }, data: { separator: '' } }
    const trim = { id: nextId(), key: 'split-trimbytes', position: { x: 1580, y: 0 }, data: { head: -2, tail: 0 } }
    nodes.push(zero, concat, trim)
    // "0" -> concat.left ; parse-value -> concat.right
    conns.push({ id: `${zero.id}.out->${concat.id}.left`, source: zero.id, sourceOutput: 'out', target: concat.id, targetInput: 'left' })
    conns.push({ id: `${parseVarByField[field]}.out->${concat.id}.right`, source: parseVarByField[field], sourceOutput: 'out', target: concat.id, targetInput: 'right' })
    // concat -> trim.in
    conns.push({ id: `${concat.id}.out->${trim.id}.in`, source: concat.id, sourceOutput: 'out', target: trim.id, targetInput: 'in' })
    padNodes[field] = trim.id
  }

  // Year + 2000 (numeric-calc). 4-digit already.
  const yearCalc = { id: nextId(), key: 'numeric-calc', position: { x: 1380, y: 0 }, data: { operator: '加', operand2: '2000' } }
  nodes.push(yearCalc)
  conns.push({ id: `${parseVarByField['年']}.out->${yearCalc.id}.left`, source: parseVarByField['年'], sourceOutput: 'out', target: yearCalc.id, targetInput: 'left' })

  // Assembly in two string-template stages (3 inputs each):
  //   stage1 = `{1}-{2}-{3}` = year-month-day
  //   stage2 = `{1} {2}` = stage1 + " " + hh:mm:ss  -> but template has 3 inputs.
  // Cleaner: use string-concat chain with separator literals.
  // yyyy-mm-dd : build "yyyy-mm-dd" via two concats with separator "-".
  const ymdConcatA = { id: nextId(), key: 'string-concat', position: { x: 1780, y: 0 }, data: { separator: '-' } } // year-month
  nodes.push(ymdConcatA)
  conns.push({ id: `${yearCalc.id}.out->${ymdConcatA.id}.left`, source: yearCalc.id, sourceOutput: 'out', target: ymdConcatA.id, targetInput: 'left' })
  conns.push({ id: `${padNodes['月']}.out->${ymdConcatA.id}.right`, source: padNodes['月'], sourceOutput: 'out', target: ymdConcatA.id, targetInput: 'right' })

  const ymdConcatB = { id: nextId(), key: 'string-concat', position: { x: 1980, y: 0 }, data: { separator: '-' } } // (yyyy-mm)-day
  nodes.push(ymdConcatB)
  conns.push({ id: `${ymdConcatA.id}.out->${ymdConcatB.id}.left`, source: ymdConcatA.id, sourceOutput: 'out', target: ymdConcatB.id, targetInput: 'left' })
  conns.push({ id: `${padNodes['日']}.out->${ymdConcatB.id}.right`, source: padNodes['日'], sourceOutput: 'out', target: ymdConcatB.id, targetInput: 'right' })

  // hh:mm:ss via two concats with separator ":"
  const hmsConcatA = { id: nextId(), key: 'string-concat', position: { x: 1780, y: 60 }, data: { separator: ':' } } // hh:mm
  nodes.push(hmsConcatA)
  conns.push({ id: `${padNodes['时']}.out->${hmsConcatA.id}.left`, source: padNodes['时'], sourceOutput: 'out', target: hmsConcatA.id, targetInput: 'left' })
  conns.push({ id: `${padNodes['分']}.out->${hmsConcatA.id}.right`, source: padNodes['分'], sourceOutput: 'out', target: hmsConcatA.id, targetInput: 'right' })

  const hmsConcatB = { id: nextId(), key: 'string-concat', position: { x: 1980, y: 60 }, data: { separator: ':' } } // (hh:mm):ss
  nodes.push(hmsConcatB)
  conns.push({ id: `${hmsConcatA.id}.out->${hmsConcatB.id}.left`, source: hmsConcatA.id, sourceOutput: 'out', target: hmsConcatB.id, targetInput: 'left' })
  conns.push({ id: `${padNodes['秒']}.out->${hmsConcatB.id}.right`, source: padNodes['秒'], sourceOutput: 'out', target: hmsConcatB.id, targetInput: 'right' })

  // Final: ymd + " " + hms
  const finalConcat = { id: nextId(), key: 'string-concat', position: { x: 2180, y: 30 }, data: { separator: ' ' } }
  nodes.push(finalConcat)
  conns.push({ id: `${ymdConcatB.id}.out->${finalConcat.id}.left`, source: ymdConcatB.id, sourceOutput: 'out', target: finalConcat.id, targetInput: 'left' })
  conns.push({ id: `${hmsConcatB.id}.out->${finalConcat.id}.right`, source: hmsConcatB.id, sourceOutput: 'out', target: finalConcat.id, targetInput: 'right' })

  // Single output-log
  const finalLog = { id: nextId(), key: 'output-log', position: { x: 2380, y: 30 }, data: { prefix: '时间', level: 'info' } }
  nodes.push(finalLog)
  conns.push({ id: `${finalConcat.id}.out->${finalLog.id}.in`, source: finalConcat.id, sourceOutput: 'out', target: finalLog.id, targetInput: 'in' })

  return { nodes, connections: conns, nextId: id, finalLogId: finalLog.id }
}

// ---- main -----------------------------------------------------------------

/**
 * In-place transform a single graph: collapse the 6 separate time logs into
 * a single yyyy-mm-dd hh:mm:ss [时间] log line using native nodes.
 * Idempotent: no-op if already merged.
 * @returns true if the graph was modified.
 */
function mergeTimeInGraph(graph, label) {
  // Idempotency: if a single "时间" log already exists, skip.
  if (findLogByPrefix(graph, '时间')) {
    console.log(`  ↳ ${label}: already merged, skip`)
    return false
  }

  // Locate the 6 time output-log nodes + their source parse-u nodes.
  const fields = ['年', '月', '日', '时', '分', '秒']
  const parseVarByField = {}
  const logsToRemove = []
  for (const field of fields) {
    const log = findLogByPrefix(graph, field)
    if (!log) throw new Error(`${label}: missing [${field}] output-log`)
    const parseU = findSourceParseU(graph, log)
    if (!parseU) throw new Error(`${label}: [${field}] log has no protocol-parse-u source`)
    parseVarByField[field] = parseU.id
    logsToRemove.push(log.id)
  }

  // Allocate new ids beyond the current max.
  const maxId = Math.max(...asArr(graph.nodes).map((n) => Number(n.id) || 0))
  const sub = buildTimeSubgraph(parseVarByField, maxId + 1)

  // Remove the 6 old separate log nodes (keep their parse-u sources — reused as inputs).
  for (const id of logsToRemove) removeNode(graph, id)

  // Append new nodes + connections.
  graph.nodes = [...asArr(graph.nodes), ...sub.nodes]
  graph.connections = [...asArr(graph.connections), ...sub.connections]
  return true
}

function rewriteFile(filename) {
  const filepath = path.join(SAMPLES_DIR, filename)
  const source = fs.readFileSync(filepath, 'utf8')
  const { graph, tail } = parseVisualScript(source)
  const changed = mergeTimeInGraph(graph, filename)
  if (changed) {
    fs.writeFileSync(filepath, buildVisualScript(graph, tail), 'utf8')
    console.log(`  ↳ ${filename}: merged → single [时间] log`)
  }
}

function rewriteTestFixtures() {
  // test/xiong-an-graphs.json holds { protocol1, protocol2 } graphs used by the
  // codegen-run tests. Keep them in sync with the .js sample scripts.
  const filepath = path.join(TEST_DIR, 'xiong-an-graphs.json')
  if (!fs.existsSync(filepath)) return
  const fixtures = JSON.parse(fs.readFileSync(filepath, 'utf8'))
  let changed = false
  for (const key of ['protocol1', 'protocol2']) {
    if (fixtures[key]) {
      const label = `xiong-an-graphs.json:${key}`
      if (mergeTimeInGraph(fixtures[key], label)) changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(filepath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8')
    console.log(`  ↳ xiong-an-graphs.json: rewritten`)
  }
}

console.log('Rewriting time format → yyyy-mm-dd hh:mm:ss (single log line):')
rewriteFile('通用位置报送协议-可视化.js')
rewriteFile('安全监测报警终端-可视化.js')
rewriteTestFixtures()
console.log('Done.')
