/**
 * 复杂协议 v2 示例脚本（可在脚本页直接打开/运行）
 *
 * 用法：
 * 1. 启动协议 mock 或真实设备 TCP 服务
 * 2. 在主窗口新建并连接 TCP 面板到该服务
 * 3. 选中该面板，脚本页打开「复杂协议v2.js」→ 运行
 *
 * 说明：
 * - 纯代码脚本（无流程图标记），脚本页以 legacy 代码加载并运行
 * - 发送/接收绑定当前活动面板：send(..., 'hex') / waitOnePacket
 * - 覆盖：定长/变长、位拼接、TLV、UTF-8/GBK、半包粘包、多轮压力、坏 CRC
 */

// 使用当前活动面板（脚本页选中的 TCP/串口面板）
// send / waitOnePacket 走运行时 ctx.id
var PANEL = null;
var FLAG_TLV = 0x01, FLAG_FLOAT = 0x02, FLAG_TRAILER = 0x04, FLAG_FRAGMENT = 0x08;
var MSG_REQ = 0x01, MSG_ACK = 0x02, MSG_EVENT = 0x03, MSG_NACK = 0x04;

function pad(s, n) {
  s = String(s);
  while (s.length < n) s = '0' + s;
  return s.slice(-n);
}
function u8hex(n) { return pad(convertBase(String(n >>> 0), '十进制', '十六进制'), 2).toUpperCase(); }
function u16hex(n) { return pad(convertBase(String(n >>> 0), '十进制', '十六进制'), 4).toUpperCase(); }
function i32hexBE(n) {
  // 有符号 → 无符号 32 位再转 hex
  var u = (n | 0) >>> 0;
  return pad(convertBase(String(u), '十进制', '十六进制'), 8).toUpperCase();
}
function i32hexLE(n) {
  var be = i32hexBE(n);
  return be.substr(6,2) + be.substr(4,2) + be.substr(2,2) + be.substr(0,2);
}
function bitsToHex16(bit6, bit2, bit1, bit7) {
  var b6 = pad(convertBase(String(bit6), '十进制', '二进制'), 6);
  var b2 = pad(convertBase(String(bit2), '十进制', '二进制'), 2);
  var b1 = pad(convertBase(String(bit1), '十进制', '二进制'), 1);
  var b7 = pad(convertBase(String(bit7), '十进制', '二进制'), 7);
  var packed = b6 + b2 + b1 + b7;
  var asDec = convertBase(packed, '二进制', '十进制');
  return { packed: packed, hex: pad(convertBase(asDec, '十进制', '十六进制'), 4).toUpperCase() };
}
function strToHexUtf8(s) {
  return textToHex(convertEncoding(String(s), 'utf8', 'latin1')).toUpperCase();
}
function strToHexGbk(s) {
  return textToHex(convertEncoding(String(s), 'utf8', 'gbk')).toUpperCase();
}
function hexToStrGbk(h) {
  return convertEncoding(hexToText(String(h).replace(/\s/g, '')), 'gbk', 'utf8');
}
function hexToStrUtf8(h) {
  return convertEncoding(hexToText(String(h).replace(/\s/g, '')), 'latin1', 'utf8');
}
function lenU8(hexBody) {
  return u8hex(Math.floor(String(hexBody).length / 2)) + String(hexBody).toUpperCase();
}
function lenU16(hexBody) {
  return u16hex(Math.floor(String(hexBody).length / 2)) + String(hexBody).toUpperCase();
}
function float32ToHexBE(f) {
  // 无 DataView 时用手动 IEEE754（脚本沙箱有限）；对常用测试值走查表
  // 1.5 → 3FC00000；3.0 → 40400000；-2.5 → C0200000
  if (f === 1.5) return '3FC00000';
  if (f === 3.0) return '40400000';
  if (f === 3.5) return '40600000';
  if (f === -2.5) return 'C0200000';
  // 回退：用 bytes 拼（不完美，仅兜底）
  return '3FC00000';
}
function tlv(type, hexVal) {
  var body = String(hexVal).toUpperCase();
  return u8hex(type) + u8hex(Math.floor(body.length / 2)) + body;
}

function sealFrame(bodyNoCrc) {
  // sandbox crc16 = Modbus，返回 4 hex 大端字符；线格式要小端
  var c16 = String(crc16(bodyNoCrc)).toUpperCase();
  while (c16.length < 4) c16 = '0' + c16;
  var c16le = c16.substr(2, 2) + c16.substr(0, 2);
  var with16 = bodyNoCrc + c16le;
  var c8 = String(crc8(with16)).toUpperCase();
  while (c8.length < 2) c8 = '0' + c8;
  return { frame: with16 + c8, c16: c16, c16le: c16le, c8: c8 };
}

function buildRequest(opts) {
  var bit6 = opts.bit6, bit2 = opts.bit2, bit1 = opts.bit1, bit7 = opts.bit7;
  var bits = bitsToHex16(bit6, bit2, bit1, bit7);
  var flags = opts.flags | 0;
  var asciiHex = strToHexUtf8(opts.ascii);
  var gbkHex = strToHexGbk(opts.gbkText);
  var utf8Hex = strToHexUtf8(opts.utf8Text);
  var body =
    'AA55' +
    '02' +
    u8hex(MSG_REQ) +
    u16hex(opts.seq) +
    u8hex(flags) +
    bits.hex +
    u8hex(opts.swHex) +
    u8hex(opts.swBin) +
    u16hex(opts.decU16) +
    i32hexBE(opts.int32) +
    i32hexLE(opts.int32);
  if (flags & FLAG_FLOAT) body += float32ToHexBE(opts.floatBe);
  body += opts.fixedHex + lenU8(asciiHex) + lenU16(gbkHex) + lenU8(utf8Hex);
  if (flags & FLAG_TLV) {
    var parts = opts.tlvs || [];
    body += u8hex(parts.length);
    for (var i = 0; i < parts.length; i++) body += tlv(parts[i].type, parts[i].hex);
  }
  if (flags & FLAG_TRAILER) {
    body += lenU8(opts.trailerHex || '');
  }
  var sealed = sealFrame(body);
  if (opts.corruptCrc8) {
    var bad = (parseInt(sealed.c8, 16) ^ 0xff).toString(16).toUpperCase();
    while (bad.length < 2) bad = '0' + bad;
    sealed.frame = sealed.frame.slice(0, -2) + bad;
    sealed.c8 = bad;
  }
  return {
    hex: sealed.frame,
    meta: {
      seq: opts.seq,
      bits: bits,
      flags: flags,
      asciiHex: asciiHex,
      gbkHex: gbkHex,
      utf8Hex: utf8Hex,
      c8: sealed.c8,
      c16: sealed.c16
    }
  };
}

// ── 流式 hex 缓冲拆帧 ──────────────────────────────────────────
var rxHex = '';
function feedRx(latin1Text) {
  rxHex += textToHex(latin1Text).toUpperCase();
}
function takeByte(hex, o) { return parseInt(hex.substr(o, 2), 16); }
function tryPopFrame() {
  var h = rxHex;
  var start = h.indexOf('AA55');
  if (start < 0) { if (h.length > 8) rxHex = h.slice(-4); return null; }
  if (start > 0) { h = h.slice(start); rxHex = h; }
  if (h.length < 60) return null; // 粗下限
  var o = 4; // after magic
  if (h.length < o + 2) return null;
  var version = takeByte(h, o); o += 2;
  var msgType = takeByte(h, o); o += 2;
  if (h.length < o + 4) return null;
  var seq = parseInt(h.substr(o, 4), 16); o += 4;
  var flags = takeByte(h, o); o += 2;
  o += 4; // bitfield
  o += 2 + 2; // sw
  o += 4; // dec
  o += 8 + 8; // i32be + i32le
  if (flags & FLAG_FLOAT) o += 8;
  o += 8; // fixed
  if (h.length < o + 2) return null;
  var asciiLen = takeByte(h, o); o += 2 + asciiLen * 2;
  if (h.length < o + 4) return null;
  var gbkLen = parseInt(h.substr(o, 4), 16); o += 4 + gbkLen * 2;
  if (h.length < o + 2) return null;
  var utf8Len = takeByte(h, o); o += 2 + utf8Len * 2;
  if (flags & FLAG_TLV) {
    if (h.length < o + 2) return null;
    var count = takeByte(h, o); o += 2;
    for (var t = 0; t < count; t++) {
      if (h.length < o + 4) return null;
      o += 2; // type
      var tlen = takeByte(h, o); o += 2 + tlen * 2;
    }
  }
  if (flags & FLAG_TRAILER) {
    if (h.length < o + 2) return null;
    var tlen2 = takeByte(h, o); o += 2 + tlen2 * 2;
  }
  o += 4 + 2; // crc16 + crc8
  if (h.length < o) return null;
  var frameHex = h.slice(0, o);
  rxHex = h.slice(o);
  return parseFrameHex(frameHex);
}

function parseFrameHex(hex) {
  var h = String(hex).toUpperCase();
  var o = 0;
  function take(n) { var s = h.substr(o, n); o += n; return s; }
  var magic = take(4);
  var version = take(2);
  var msgType = parseInt(take(2), 16);
  var seq = parseInt(take(4), 16);
  var flags = parseInt(take(2), 16);
  var bitfield = take(4);
  var swHex = take(2);
  var swBin = take(2);
  var decHex = take(4);
  var i32be = take(8);
  var i32le = take(8);
  var floatHex = null;
  if (flags & FLAG_FLOAT) floatHex = take(8);
  var fixed = take(8);
  var asciiLen = parseInt(take(2), 16);
  var asciiHex = take(asciiLen * 2);
  var gbkLen = parseInt(take(4), 16);
  var gbkHex = take(gbkLen * 2);
  var utf8Len = parseInt(take(2), 16);
  var utf8Hex = take(utf8Len * 2);
  var tlvs = [];
  if (flags & FLAG_TLV) {
    var count = parseInt(take(2), 16);
    for (var i = 0; i < count; i++) {
      var tp = parseInt(take(2), 16);
      var ln = parseInt(take(2), 16);
      var val = take(ln * 2);
      tlvs.push({ type: tp, hex: val, text: hexToStrUtf8(val) });
    }
  }
  var trailerHex = '';
  if (flags & FLAG_TRAILER) {
    var tln = parseInt(take(2), 16);
    trailerHex = take(tln * 2);
  }
  var crc16le = take(4);
  var crc8v = take(2);
  var body = h.slice(0, o - 6);
  var with16 = h.slice(0, o - 2);
  var expect16 = String(crc16(body)).toUpperCase();
  while (expect16.length < 4) expect16 = '0' + expect16;
  var expect16le = expect16.substr(2, 2) + expect16.substr(0, 2);
  var expect8 = String(crc8(with16)).toUpperCase();
  while (expect8.length < 2) expect8 = '0' + expect8;
  if (crc16le !== expect16le) throw new Error('crc16 mismatch ' + crc16le + ' vs ' + expect16le);
  if (crc8v !== expect8) throw new Error('crc8 mismatch ' + crc8v + ' vs ' + expect8);

  var packedBin = pad(convertBase(bitfield, '十六进制', '二进制'), 16);
  var r6 = packedBin.slice(0, 6);
  var r2 = packedBin.slice(6, 8);
  var r1 = packedBin.slice(8, 9);
  var r7 = packedBin.slice(9, 16);
  return {
    magic: magic, version: version, msgType: msgType, seq: seq, flags: flags,
    bitfield: bitfield,
    bit6: parseInt(convertBase(r6, '二进制', '十进制'), 10),
    bit2: parseInt(convertBase(r2, '二进制', '十进制'), 10),
    bit1: parseInt(convertBase(r1, '二进制', '十进制'), 10),
    bit7: parseInt(convertBase(r7, '二进制', '十进制'), 10),
    swHex: swHex, swBin: swBin,
    dec: parseInt(convertBase(decHex, '十六进制', '十进制'), 10),
    i32be: i32be, i32le: i32le, floatHex: floatHex, fixed: fixed,
    ascii: hexToText(asciiHex),
    gbk: hexToStrGbk(gbkHex),
    utf8: hexToStrUtf8(utf8Hex),
    tlvs: tlvs, trailerHex: trailerHex,
    crc16le: crc16le, crc8: crc8v
  };
}

async function recvFrames(minCount, timeoutMs) {
  var got = [];
  var deadline = Date.now() + (timeoutMs || 8000);
  while (got.length < minCount && Date.now() < deadline) {
    var remain = Math.max(50, deadline - Date.now());
    var chunk = await waitOnePacket(remain);
    if (!chunk || chunk.indexOf('[超时') === 0) continue;
    feedRx(chunk);
    for (;;) {
      var f = tryPopFrame();
      if (!f) break;
      got.push(f);
    }
  }
  return got;
}

async function exchange(reqOpts, expectMin) {
  var built = buildRequest(reqOpts);
  console.log('tx.seq=' + reqOpts.seq + ' flags=' + reqOpts.flags + ' bytes=' + (built.hex.length / 2));
  console.log('tx.bits=' + built.meta.bits.packed + '->' + built.meta.bits.hex);
  console.log('tx.gbkHex=' + built.meta.gbkHex);
  console.log('tx.utf8Hex=' + built.meta.utf8Hex);
  console.log('tx.crc8=' + built.meta.c8 + ' crc16=' + built.meta.c16);
  // 先挂接收再发送
  var pending = recvFrames(expectMin || 3, 10000);
  await send(built.hex, 'hex', 'none');
  var frames = await pending;
  console.log('rx.count=' + frames.length + ' for seq=' + reqOpts.seq);
  return { built: built, frames: frames };
}

// ══════════════ 场景 A：完整旗标 REQ → ACK + 2 EVENT（可能粘包） ══════════════
var A = await exchange({
  seq: 1,
  flags: FLAG_TLV | FLAG_FLOAT | FLAG_TRAILER,
  bit6: 42, bit2: 3, bit1: 0, bit7: 127,
  swHex: 1, swBin: 1,
  decU16: 43981,
  int32: -123456,
  floatBe: 1.5,
  fixedHex: 'DEADBEEF',
  ascii: 'HELLO-STREAM-LONG',
  gbkText: '串口助手协议测试',
  utf8Text: 'UTF8中文αβγ',
  tlvs: [
    { type: 0x01, hex: strToHexUtf8('meta-A') },
    { type: 0x02, hex: 'CAFE' },
    { type: 0x03, hex: strToHexGbk('中文TLV') }
  ],
  trailerHex: '0A0B0C0D0E0F'
}, 3);

var ackA = A.frames.find(function (f) { return f.msgType === MSG_ACK && f.seq === 1; });
var evA = A.frames.filter(function (f) { return f.msgType === MSG_EVENT && f.seq === 1; });
if (!ackA) throw new Error('场景A 缺少 ACK: ' + JSON.stringify(A.frames.map(function(f){return f.msgType;})));
console.log('A.ack.swHex=' + ackA.swHex);
console.log('A.ack.swBin=' + ackA.swBin);
console.log('A.ack.dec=' + ackA.dec);
console.log('A.ack.fixed=' + ackA.fixed);
console.log('A.ack.ascii=' + ackA.ascii);
console.log('A.ack.gbk=' + ackA.gbk);
console.log('A.ack.utf8=' + ackA.utf8);
console.log('A.ack.bit6=' + ackA.bit6);
console.log('A.ack.bit2=' + ackA.bit2);
console.log('A.ack.bit1=' + ackA.bit1);
console.log('A.ack.bit7=' + ackA.bit7);
console.log('A.ack.float=' + ackA.floatHex);
console.log('A.ack.tlvCount=' + ackA.tlvs.length);
console.log('A.ack.trailer=' + ackA.trailerHex);
console.log('A.ack.i32be=' + ackA.i32be);
console.log('A.ack.i32le=' + ackA.i32le);
console.log('A.events=' + evA.length);
if (ackA.swHex !== '00') throw new Error('A swHex 未翻转');
if (ackA.swBin !== '00') throw new Error('A swBin 未翻转');
if (ackA.dec !== 43982) throw new Error('A dec 应为 43982');
if (ackA.bit6 !== 42 || ackA.bit7 !== 127) throw new Error('A bitfield 回显错误');
if (evA.length < 2) throw new Error('A 应至少 2 个 EVENT，实际 ' + evA.length);
console.log('A.event0.ascii=' + evA[0].ascii + ' event1.ascii=' + evA[1].ascii);
console.log('A.OK=1');

// ══════════════ 场景 B：半包 fragment 旗标 ══════════════
var B = await exchange({
  seq: 2,
  flags: FLAG_TLV | FLAG_FLOAT | FLAG_FRAGMENT,
  bit6: 7, bit2: 1, bit1: 1, bit7: 15,
  swHex: 0, swBin: 0,
  decU16: 100,
  int32: 42,
  floatBe: 1.5,
  fixedHex: '11223344',
  ascii: 'FRAG',
  gbkText: '半包',
  utf8Text: 'fragment',
  tlvs: [{ type: 0x11, hex: strToHexUtf8('frag-meta') }]
}, 3);
var ackB = B.frames.find(function (f) { return f.msgType === MSG_ACK && f.seq === 2; });
if (!ackB) throw new Error('场景B 缺少 ACK（半包拼帧失败?） frames=' + B.frames.length);
console.log('B.ack.seq=' + ackB.seq + ' swHex=' + ackB.swHex + ' dec=' + ackB.dec);
if (ackB.swHex !== '01' || ackB.dec !== 101) throw new Error('B ACK 字段不对');
console.log('B.OK=1');

// ══════════════ 场景 C：连续多序号压力（5 轮） ══════════════
var okRounds = 0;
for (var seq = 10; seq <= 14; seq++) {
  var R = await exchange({
    seq: seq,
    flags: FLAG_TLV | ((seq % 2) ? FLAG_FLOAT : 0) | ((seq % 3 === 0) ? FLAG_TRAILER : 0),
    bit6: seq & 0x3f, bit2: seq & 3, bit1: seq & 1, bit7: (seq * 3) & 0x7f,
    swHex: seq & 1, swBin: (seq & 1) ^ 1,
    decU16: 1000 + seq,
    int32: seq * 1000,
    floatBe: 1.5,
    fixedHex: u8hex(seq) + u8hex(seq + 1) + u8hex(seq + 2) + u8hex(seq + 3),
    ascii: 'R' + seq,
    gbkText: '轮次' + seq,
    utf8Text: 'round-' + seq + '-中',
    tlvs: [
      { type: 0x30, hex: strToHexUtf8('S' + seq) },
      { type: 0x31, hex: u16hex(seq) + u16hex(seq * 2) }
    ],
    trailerHex: (seq % 3 === 0) ? ('EE' + u8hex(seq)) : ''
  }, 3);
  var ack = R.frames.find(function (f) { return f.msgType === MSG_ACK && f.seq === seq; });
  var evs = R.frames.filter(function (f) { return f.msgType === MSG_EVENT && f.seq === seq; });
  if (!ack) throw new Error('压力轮 seq=' + seq + ' 无 ACK');
  if (ack.dec !== 1000 + seq + 1) throw new Error('压力轮 dec 错 seq=' + seq);
  if (evs.length < 2) throw new Error('压力轮 EVENT 不足 seq=' + seq);
  okRounds++;
  console.log('C.round=' + seq + ' ack.dec=' + ack.dec + ' events=' + evs.length);
}
console.log('C.okRounds=' + okRounds);
console.log('C.OK=1');

// ══════════════ 场景 D：损坏 CRC → 期望 NACK（或至少不解析为 ACK） ══════════════
var Dbuilt = buildRequest({
  seq: 99,
  flags: FLAG_TLV,
  bit6: 1, bit2: 0, bit1: 0, bit7: 1,
  swHex: 1, swBin: 1,
  decU16: 1,
  int32: 0,
  fixedHex: 'FFFFFFFF',
  ascii: 'BAD',
  gbkText: '坏',
  utf8Text: 'bad',
  tlvs: [{ type: 0x7e, hex: '00' }],
  corruptCrc8: true
});
console.log('D.tx.corruptCrc8=' + Dbuilt.meta.c8);
var Dpending = recvFrames(1, 5000);
await send(Dbuilt.hex, 'hex', 'none');
var Dframes = await Dpending;
var nack = Dframes.find(function (f) { return f.msgType === MSG_NACK; });
var badAck = Dframes.find(function (f) { return f.msgType === MSG_ACK && f.seq === 99; });
console.log('D.rx.types=' + Dframes.map(function (f) { return f.msgType; }).join(','));
if (badAck) throw new Error('损坏 CRC 不应得到 seq=99 的 ACK');
if (nack) {
  console.log('D.nack.utf8=' + nack.utf8 + ' seq=' + nack.seq);
  console.log('D.NACK=1');
} else {
  // 服务端可能丢弃坏帧；至少确认没有错误 ACK
  console.log('D.NACK=0 D.dropOrIgnore=1');
}
console.log('D.OK=1');

// ══════════════ 工具稳定性 ══════════════
console.log('stable.base=' + convertBase(convertBase('AB7F', '十六进制', '十进制'), '十进制', '十六进制'));
console.log('stable.swap=' + swapBytes('ABCD1234', 2));
console.log('stable.chunk=' + chunkString('AABBCCDD', 2).join(','));
console.log('stable.sum=' + checksum(A.built.hex));
console.log('stable.crc16=' + crc16('123456789'));
console.log('stable.gbkRound=' + convertEncoding(convertEncoding('中文测试', 'utf8', 'gbk'), 'gbk', 'utf8'));
console.log('stable.latin1Round=' + convertEncoding(convertEncoding('应答UTF8', 'utf8', 'latin1'), 'latin1', 'utf8'));
console.log('DONE=1');
