/* VS_FLOW_START
{
  "nodes": [
    {
      "id": "1",
      "key": "output-log",
      "label": "帧说明",
      "position": {
        "x": 40,
        "y": 20
      },
      "data": {
        "prefix": "帧说明",
        "level": "info"
      }
    },
    {
      "id": "2",
      "key": "input-manual",
      "label": "说明文本",
      "position": {
        "x": 40,
        "y": 60
      },
      "data": {
        "content": "帧=magic(AA55)+序列号(1B)+位域(2B)+定长(DEADBEEF)+ascii(长前缀+体)+utf8(长前缀+体)+CRC16+CRC8。循环5次，偶数成功，奇数失败。",
        "mode": "text"
      }
    },
    {
      "id": "3",
      "key": "control-loop",
      "label": "循环5次",
      "position": {
        "x": 40,
        "y": 540
      },
      "data": {
        "count": 5,
        "type": "次数循环"
      }
    },
    {
      "id": "4",
      "key": "protocol-const",
      "label": "序列号HEX",
      "position": {
        "x": 280,
        "y": 540
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "5",
      "key": "numeric-calc",
      "label": "seq取余2",
      "position": {
        "x": 280,
        "y": 640
      },
      "data": {
        "operator": "取余",
        "operand2": "2"
      }
    },
    {
      "id": "6",
      "key": "compare-eq",
      "label": "是否偶数",
      "position": {
        "x": 520,
        "y": 640
      },
      "data": {
        "operand": "0"
      }
    },
    {
      "id": "7",
      "key": "control-if",
      "label": "奇偶分支",
      "position": {
        "x": 760,
        "y": 580
      },
      "data": {}
    },
    {
      "id": "8",
      "key": "input-manual",
      "label": "偶数文本",
      "position": {
        "x": 760,
        "y": 480
      },
      "data": {
        "content": "偶数→成功",
        "mode": "text"
      }
    },
    {
      "id": "9",
      "key": "output-log",
      "label": "日志偶数成功",
      "position": {
        "x": 1000,
        "y": 480
      },
      "data": {
        "prefix": "发送结果",
        "level": "info"
      }
    },
    {
      "id": "10",
      "key": "input-manual",
      "label": "奇数文本",
      "position": {
        "x": 760,
        "y": 700
      },
      "data": {
        "content": "奇数→失败",
        "mode": "text"
      }
    },
    {
      "id": "11",
      "key": "output-log",
      "label": "日志奇数失败",
      "position": {
        "x": 1000,
        "y": 700
      },
      "data": {
        "prefix": "发送结果",
        "level": "info"
      }
    },
    {
      "id": "12",
      "key": "protocol-const",
      "label": "发magic",
      "position": {
        "x": 280,
        "y": 760
      },
      "data": {
        "mode": "hex",
        "content": "AA55",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "13",
      "key": "protocol-const",
      "label": "发位域",
      "position": {
        "x": 280,
        "y": 820
      },
      "data": {
        "mode": "hex",
        "content": "AB7F",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "14",
      "key": "protocol-const",
      "label": "发定长",
      "position": {
        "x": 280,
        "y": 880
      },
      "data": {
        "mode": "hex",
        "content": "DEADBEEF",
        "width": 4,
        "encoding": "utf8"
      }
    },
    {
      "id": "15",
      "key": "protocol-const",
      "label": "发ascii",
      "position": {
        "x": 280,
        "y": 940
      },
      "data": {
        "mode": "text",
        "content": "HELLO",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "16",
      "key": "protocol-const",
      "label": "发utf8",
      "position": {
        "x": 280,
        "y": 1000
      },
      "data": {
        "mode": "text",
        "content": "UTF8中",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "17",
      "key": "protocol-len-prefix",
      "label": "发ascii加长",
      "position": {
        "x": 520,
        "y": 940
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "18",
      "key": "protocol-len-prefix",
      "label": "发utf8加长",
      "position": {
        "x": 520,
        "y": 1000
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "19",
      "key": "protocol-concat",
      "label": "拼帧头",
      "position": {
        "x": 760,
        "y": 760
      },
      "data": {}
    },
    {
      "id": "20",
      "key": "protocol-concat",
      "label": "拼帧体",
      "position": {
        "x": 1000,
        "y": 880
      },
      "data": {}
    },
    {
      "id": "21",
      "key": "protocol-concat",
      "label": "拼完整帧",
      "position": {
        "x": 1240,
        "y": 940
      },
      "data": {}
    },
    {
      "id": "22",
      "key": "protocol-crc",
      "label": "封包CRC16",
      "position": {
        "x": 1480,
        "y": 920
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "是"
      }
    },
    {
      "id": "57",
      "key": "protocol-crc",
      "label": "封包CRC8",
      "position": {
        "x": 1480,
        "y": 1000
      },
      "data": {
        "algorithm": "CRC8",
        "append": "是"
      }
    },
    {
      "id": "23",
      "key": "output-log",
      "label": "日志发送",
      "position": {
        "x": 1720,
        "y": 880
      },
      "data": {
        "prefix": "发送",
        "level": "info"
      }
    },
    {
      "id": "24",
      "key": "output-tcp",
      "label": "发送TCP",
      "position": {
        "x": 1720,
        "y": 940
      },
      "data": {
        "host": "127.0.0.1",
        "port": 9000,
        "mode": "hex"
      }
    },
    {
      "id": "25",
      "key": "control-delay",
      "label": "间隔500ms",
      "position": {
        "x": 1720,
        "y": 1000
      },
      "data": {
        "ms": 500
      }
    },
    {
      "id": "26",
      "key": "input-tcp",
      "label": "接收TCP",
      "position": {
        "x": 40,
        "y": 1120
      },
      "data": {
        "host": "127.0.0.1",
        "port": 9000
      }
    },
    {
      "id": "27",
      "key": "protocol-slice",
      "label": "拆魔数",
      "position": {
        "x": 280,
        "y": 1120
      },
      "data": {
        "start": 0,
        "length": 2
      }
    },
    {
      "id": "28",
      "key": "protocol-slice",
      "label": "拆序列号",
      "position": {
        "x": 280,
        "y": 1180
      },
      "data": {
        "start": 2,
        "length": 1
      }
    },
    {
      "id": "29",
      "key": "protocol-parse-u",
      "label": "序列号值",
      "position": {
        "x": 520,
        "y": 1180
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "30",
      "key": "protocol-slice",
      "label": "拆位域",
      "position": {
        "x": 280,
        "y": 1240
      },
      "data": {
        "start": 3,
        "length": 2
      }
    },
    {
      "id": "31",
      "key": "protocol-bitfield",
      "label": "拆位域",
      "position": {
        "x": 520,
        "y": 1240
      },
      "data": {
        "mode": "解包",
        "fields": [
          { "id": "f1", "name": "6bit位", "bits": 6 },
          { "id": "f2", "name": "2bit位", "bits": 2 },
          { "id": "f3", "name": "1bit位", "bits": 1 },
          { "id": "f4", "name": "7bit位", "bits": 7 }
        ]
      }
    },
    {
      "id": "33",
      "key": "protocol-slice",
      "label": "拆定长",
      "position": {
        "x": 280,
        "y": 1360
      },
      "data": {
        "start": 5,
        "length": 4
      }
    },
    {
      "id": "34",
      "key": "protocol-slice",
      "label": "拆ascii长",
      "position": {
        "x": 280,
        "y": 1420
      },
      "data": {
        "start": 9,
        "length": 1
      }
    },
    {
      "id": "35",
      "key": "protocol-parse-u",
      "label": "ascii长度值",
      "position": {
        "x": 520,
        "y": 1420
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "36",
      "key": "protocol-slice",
      "label": "拆ascii体",
      "position": {
        "x": 280,
        "y": 1480
      },
      "data": {
        "start": 10,
        "length": 0
      }
    },
    {
      "id": "37",
      "key": "protocol-decode-text",
      "label": "解码ascii",
      "position": {
        "x": 520,
        "y": 1480
      },
      "data": {
        "encoding": "utf8"
      }
    },
    {
      "id": "38",
      "key": "numeric-calc",
      "label": "utf8长偏移",
      "position": {
        "x": 280,
        "y": 1540
      },
      "data": {
        "operator": "加",
        "operand2": "10"
      }
    },
    {
      "id": "39",
      "key": "protocol-slice",
      "label": "拆utf8长",
      "position": {
        "x": 520,
        "y": 1540
      },
      "data": {
        "start": 0,
        "length": 1
      }
    },
    {
      "id": "40",
      "key": "protocol-parse-u",
      "label": "utf8长度值",
      "position": {
        "x": 760,
        "y": 1540
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "41",
      "key": "numeric-calc",
      "label": "utf8体偏移",
      "position": {
        "x": 280,
        "y": 1600
      },
      "data": {
        "operator": "加",
        "operand2": "11"
      }
    },
    {
      "id": "42",
      "key": "protocol-slice",
      "label": "拆utf8体",
      "position": {
        "x": 520,
        "y": 1600
      },
      "data": {
        "start": 0,
        "length": 0
      }
    },
    {
      "id": "43",
      "key": "protocol-decode-text",
      "label": "解码utf8",
      "position": {
        "x": 760,
        "y": 1600
      },
      "data": {
        "encoding": "utf8"
      }
    },
    {
      "id": "44",
      "key": "protocol-slice",
      "label": "拆body去尾",
      "position": {
        "x": 280,
        "y": 1680
      },
      "data": {
        "start": 0,
        "length": 23
      }
    },
    {
      "id": "45",
      "key": "protocol-crc",
      "label": "算crc16",
      "position": {
        "x": 520,
        "y": 1680
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "否"
      }
    },
    {
      "id": "46",
      "key": "protocol-slice",
      "label": "拆帧尾crc16",
      "position": {
        "x": 280,
        "y": 1740
      },
      "data": {
        "start": 23,
        "length": 2
      }
    },
    {
      "id": "47",
      "key": "compare-eq",
      "label": "CRC校验",
      "position": {
        "x": 760,
        "y": 1700
      },
      "data": {}
    },
    {
      "id": "48",
      "key": "output-log",
      "label": "日志魔数",
      "position": {
        "x": 1000,
        "y": 1120
      },
      "data": {
        "prefix": "接收.魔数",
        "level": "info"
      }
    },
    {
      "id": "49",
      "key": "output-log",
      "label": "日志序列号",
      "position": {
        "x": 1000,
        "y": 1180
      },
      "data": {
        "prefix": "接收.序列号",
        "level": "info"
      }
    },
    {
      "id": "50",
      "key": "output-log",
      "label": "日志6bit",
      "position": {
        "x": 1000,
        "y": 1240
      },
      "data": {
        "prefix": "接收.6bit",
        "level": "info"
      }
    },
    {
      "id": "51",
      "key": "output-log",
      "label": "日志7bit",
      "position": {
        "x": 1000,
        "y": 1300
      },
      "data": {
        "prefix": "接收.7bit",
        "level": "info"
      }
    },
    {
      "id": "52",
      "key": "output-log",
      "label": "日志ascii长",
      "position": {
        "x": 1000,
        "y": 1420
      },
      "data": {
        "prefix": "接收.ascii长",
        "level": "info"
      }
    },
    {
      "id": "53",
      "key": "output-log",
      "label": "日志ascii",
      "position": {
        "x": 1000,
        "y": 1480
      },
      "data": {
        "prefix": "接收.ascii",
        "level": "info"
      }
    },
    {
      "id": "54",
      "key": "output-log",
      "label": "日志utf8长",
      "position": {
        "x": 1000,
        "y": 1540
      },
      "data": {
        "prefix": "接收.utf8长",
        "level": "info"
      }
    },
    {
      "id": "55",
      "key": "output-log",
      "label": "日志utf8",
      "position": {
        "x": 1000,
        "y": 1600
      },
      "data": {
        "prefix": "接收.utf8",
        "level": "info"
      }
    },
    {
      "id": "56",
      "key": "output-log",
      "label": "日志CRC校验",
      "position": {
        "x": 1000,
        "y": 1700
      },
      "data": {
        "prefix": "接收.CRC校验",
        "level": "info"
      }
    }
  ],
  "connections": [
    {
      "id": "说明文本->帧说明.in",
      "source": "2",
      "sourceOutput": "out",
      "target": "1",
      "targetInput": "in"
    },
    {
      "id": "循环5次->序列号HEX.content",
      "source": "3",
      "sourceOutput": "out",
      "target": "4",
      "targetInput": "content"
    },
    {
      "id": "循环5次->seq取余2.left",
      "source": "3",
      "sourceOutput": "out",
      "target": "5",
      "targetInput": "left"
    },
    {
      "id": "seq取余2->是否偶数.left",
      "source": "5",
      "sourceOutput": "out",
      "target": "6",
      "targetInput": "left"
    },
    {
      "id": "是否偶数.result->奇偶分支.condition",
      "source": "6",
      "sourceOutput": "result",
      "target": "7",
      "targetInput": "condition"
    },
    {
      "id": "偶数文本->日志偶数成功.in",
      "source": "8",
      "sourceOutput": "out",
      "target": "9",
      "targetInput": "in"
    },
    {
      "id": "奇数文本->日志奇数失败.in",
      "source": "10",
      "sourceOutput": "out",
      "target": "11",
      "targetInput": "in"
    },
    {
      "id": "奇偶分支.true->日志偶数成功.trigger",
      "source": "7",
      "sourceOutput": "true",
      "target": "9",
      "targetInput": "trigger"
    },
    {
      "id": "奇偶分支.false->日志奇数失败.trigger",
      "source": "7",
      "sourceOutput": "false",
      "target": "11",
      "targetInput": "trigger"
    },
    {
      "id": "发ascii->发ascii加长.body",
      "source": "15",
      "sourceOutput": "out",
      "target": "17",
      "targetInput": "body"
    },
    {
      "id": "发utf8->发utf8加长.body",
      "source": "16",
      "sourceOutput": "out",
      "target": "18",
      "targetInput": "body"
    },
    {
      "id": "发magic->拼帧头.a",
      "source": "12",
      "sourceOutput": "out",
      "target": "19",
      "targetInput": "a"
    },
    {
      "id": "序列号HEX->拼帧头.b",
      "source": "4",
      "sourceOutput": "out",
      "target": "19",
      "targetInput": "b"
    },
    {
      "id": "发位域->拼帧头.c",
      "source": "13",
      "sourceOutput": "out",
      "target": "19",
      "targetInput": "c"
    },
    {
      "id": "拼帧头->拼帧体.a",
      "source": "19",
      "sourceOutput": "out",
      "target": "20",
      "targetInput": "a"
    },
    {
      "id": "发定长->拼帧体.b",
      "source": "14",
      "sourceOutput": "out",
      "target": "20",
      "targetInput": "b"
    },
    {
      "id": "拼帧体->拼完整帧.a",
      "source": "20",
      "sourceOutput": "out",
      "target": "21",
      "targetInput": "a"
    },
    {
      "id": "发ascii加长->拼完整帧.b",
      "source": "17",
      "sourceOutput": "out",
      "target": "21",
      "targetInput": "b"
    },
    {
      "id": "发utf8加长->拼完整帧.c",
      "source": "18",
      "sourceOutput": "out",
      "target": "21",
      "targetInput": "c"
    },
    {
      "id": "拼完整帧->封包CRC16.body",
      "source": "21",
      "sourceOutput": "out",
      "target": "22",
      "targetInput": "body"
    },
    {
      "id": "封包CRC16->封包CRC8.body",
      "source": "22",
      "sourceOutput": "out",
      "target": "57",
      "targetInput": "body"
    },
    {
      "id": "封包CRC8->日志发送.in",
      "source": "57",
      "sourceOutput": "out",
      "target": "23",
      "targetInput": "in"
    },
    {
      "id": "封包CRC8->发送TCP.in",
      "source": "57",
      "sourceOutput": "out",
      "target": "24",
      "targetInput": "in"
    },
    {
      "id": "封包CRC8->间隔500ms.in",
      "source": "57",
      "sourceOutput": "out",
      "target": "25",
      "targetInput": "in"
    },
    {
      "id": "接收TCP->拆魔数.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "27",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆序列号.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "28",
      "targetInput": "hex"
    },
    {
      "id": "拆序列号->序列号值.hex",
      "source": "28",
      "sourceOutput": "out",
      "target": "29",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆位域.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "30",
      "targetInput": "hex"
    },
    {
      "id": "拆位域hex->拆位域解包.hex",
      "source": "30",
      "sourceOutput": "out",
      "target": "31",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆定长.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "33",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆ascii长.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "34",
      "targetInput": "hex"
    },
    {
      "id": "拆ascii长->ascii长度值.hex",
      "source": "34",
      "sourceOutput": "out",
      "target": "35",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆ascii体.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "36",
      "targetInput": "hex"
    },
    {
      "id": "ascii长度值->拆ascii体.length",
      "source": "35",
      "sourceOutput": "out",
      "target": "36",
      "targetInput": "length"
    },
    {
      "id": "拆ascii体->解码ascii.hex",
      "source": "36",
      "sourceOutput": "out",
      "target": "37",
      "targetInput": "hex"
    },
    {
      "id": "ascii长度值->utf8长偏移.left",
      "source": "35",
      "sourceOutput": "out",
      "target": "38",
      "targetInput": "left"
    },
    {
      "id": "接收TCP->拆utf8长.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "hex"
    },
    {
      "id": "utf8长偏移->拆utf8长.start",
      "source": "38",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "start"
    },
    {
      "id": "拆utf8长->utf8长度值.hex",
      "source": "39",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "hex"
    },
    {
      "id": "ascii长度值->utf8体偏移.left",
      "source": "35",
      "sourceOutput": "out",
      "target": "41",
      "targetInput": "left"
    },
    {
      "id": "接收TCP->拆utf8体.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "42",
      "targetInput": "hex"
    },
    {
      "id": "utf8体偏移->拆utf8体.start",
      "source": "41",
      "sourceOutput": "out",
      "target": "42",
      "targetInput": "start"
    },
    {
      "id": "utf8长度值->拆utf8体.length",
      "source": "40",
      "sourceOutput": "out",
      "target": "42",
      "targetInput": "length"
    },
    {
      "id": "拆utf8体->解码utf8.hex",
      "source": "42",
      "sourceOutput": "out",
      "target": "43",
      "targetInput": "hex"
    },
    {
      "id": "接收TCP->拆body去尾.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "44",
      "targetInput": "hex"
    },
    {
      "id": "拆body去尾->算crc16.body",
      "source": "44",
      "sourceOutput": "out",
      "target": "45",
      "targetInput": "body"
    },
    {
      "id": "接收TCP->拆帧尾crc16.hex",
      "source": "26",
      "sourceOutput": "out",
      "target": "46",
      "targetInput": "hex"
    },
    {
      "id": "算crc16->CRC校验.left",
      "source": "45",
      "sourceOutput": "out",
      "target": "47",
      "targetInput": "left"
    },
    {
      "id": "拆帧尾crc16->CRC校验.right",
      "source": "46",
      "sourceOutput": "out",
      "target": "47",
      "targetInput": "right"
    },
    {
      "id": "拆魔数->日志魔数.in",
      "source": "27",
      "sourceOutput": "out",
      "target": "48",
      "targetInput": "in"
    },
    {
      "id": "序列号值->日志序列号.in",
      "source": "29",
      "sourceOutput": "out",
      "target": "49",
      "targetInput": "in"
    },
    {
      "id": "拆位域.6bit->日志6bit.in",
      "source": "31",
      "sourceOutput": "field_f1",
      "target": "50",
      "targetInput": "in"
    },
    {
      "id": "拆位域.7bit->日志7bit.in",
      "source": "31",
      "sourceOutput": "field_f4",
      "target": "51",
      "targetInput": "in"
    },
    {
      "id": "ascii长度值->日志ascii长.in",
      "source": "35",
      "sourceOutput": "out",
      "target": "52",
      "targetInput": "in"
    },
    {
      "id": "解码ascii->日志ascii.in",
      "source": "37",
      "sourceOutput": "out",
      "target": "53",
      "targetInput": "in"
    },
    {
      "id": "utf8长度值->日志utf8长.in",
      "source": "40",
      "sourceOutput": "out",
      "target": "54",
      "targetInput": "in"
    },
    {
      "id": "解码utf8->日志utf8.in",
      "source": "43",
      "sourceOutput": "out",
      "target": "55",
      "targetInput": "in"
    },
    {
      "id": "CRC校验.result->日志CRC校验.in",
      "source": "47",
      "sourceOutput": "result",
      "target": "56",
      "targetInput": "in"
    }
  ]
}
VS_FLOW_END */
// Generated code:
// 打开后由脚本页根据流程图重新生成代码
// 演示：循环5次组帧发送，序列号自增，奇偶判断（偶数成功/奇数失败），echo 回弹拆帧
