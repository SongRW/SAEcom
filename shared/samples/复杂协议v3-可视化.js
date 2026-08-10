/* VS_FLOW_START
{
  "nodes": [
    {
      "id": "1",
      "key": "control-loop",
      "label": "复杂协议v3.循环1000次",
      "position": {
        "x": 0,
        "y": 40
      },
      "data": {
        "count": 1000,
        "type": "次数循环"
      }
    },
    {
      "id": "2",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.magic",
      "position": {
        "x": 0,
        "y": 144
      },
      "data": {
        "mode": "hex",
        "content": "AA55",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "3",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.version",
      "position": {
        "x": 300,
        "y": 144
      },
      "data": {
        "mode": "hex",
        "content": "03",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "4",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.msgType",
      "position": {
        "x": 600,
        "y": 144
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
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.seq",
      "position": {
        "x": 900,
        "y": 144
      },
      "data": {
        "mode": "decimal",
        "content": "0",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "6",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.flags",
      "position": {
        "x": 1200,
        "y": 144
      },
      "data": {
        "mode": "hex",
        "content": "FF",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "7",
      "key": "input-manual",
      "label": "复杂协议v3.REQ.控制字.优先级",
      "position": {
        "x": 1500,
        "y": 248
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "8",
      "key": "input-manual",
      "label": "复杂协议v3.REQ.控制字.重试",
      "position": {
        "x": 1500,
        "y": 352
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "9",
      "key": "input-manual",
      "label": "复杂协议v3.REQ.控制字.告警",
      "position": {
        "x": 1500,
        "y": 456
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "10",
      "key": "protocol-bitfield",
      "label": "复杂协议v3.REQ.控制字",
      "position": {
        "x": 1500,
        "y": 144
      },
      "data": {
        "mode": "打包",
        "fields": [
          {
            "id": "f0",
            "name": "优先级",
            "bits": 4
          },
          {
            "id": "f1",
            "name": "重试",
            "bits": 4
          },
          {
            "id": "f2",
            "name": "告警",
            "bits": 8
          }
        ]
      }
    },
    {
      "id": "11",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.命令码",
      "position": {
        "x": 1800,
        "y": 144
      },
      "data": {
        "mode": "decimal",
        "content": "17",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "12",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.目标ID",
      "position": {
        "x": 2100,
        "y": 144
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "13",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.设备名",
      "position": {
        "x": 2400,
        "y": 144
      },
      "data": {
        "mode": "text",
        "content": "STATION-A",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "14",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.传感器1",
      "position": {
        "x": 300,
        "y": 248
      },
      "data": {
        "mode": "decimal",
        "content": "257",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "15",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.传感器2",
      "position": {
        "x": 600,
        "y": 248
      },
      "data": {
        "mode": "decimal",
        "content": "258",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "16",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.传感器3",
      "position": {
        "x": 900,
        "y": 248
      },
      "data": {
        "mode": "decimal",
        "content": "259",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "17",
      "key": "protocol-const",
      "label": "复杂协议v3.REQ.扩展时间.扩展时间",
      "position": {
        "x": 1200,
        "y": 248
      },
      "data": {
        "mode": "decimal",
        "content": "270545216",
        "width": 4,
        "encoding": "utf8"
      }
    },
    {
      "id": "18",
      "key": "custom-aes-crypto",
      "label": "复杂协议v3.REQ.载荷加密",
      "position": {
        "x": 1500,
        "y": 248
      },
      "data": {
        "mode": "encrypt",
        "key": "000102030405060708090A0B0C0D0E0F",
        "iv": "101112131415161718191A1B1C1D1E1F"
      }
    },
    {
      "id": "19",
      "key": "protocol-const",
      "label": "参数区.类型T10",
      "position": {
        "x": 0,
        "y": 352
      },
      "data": {
        "mode": "hex",
        "content": "10",
        "width": 1
      }
    },
    {
      "id": "20",
      "key": "protocol-const",
      "label": "参数区.值T10",
      "position": {
        "x": 300,
        "y": 352
      },
      "data": {
        "mode": "hex",
        "content": "AABBCC",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "21",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T10",
      "position": {
        "x": 600,
        "y": 352
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "22",
      "key": "protocol-concat",
      "label": "参数区.条目T10",
      "position": {
        "x": 900,
        "y": 352
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "23",
      "key": "protocol-const",
      "label": "参数区.类型T11",
      "position": {
        "x": 1200,
        "y": 352
      },
      "data": {
        "mode": "hex",
        "content": "11",
        "width": 1
      }
    },
    {
      "id": "24",
      "key": "protocol-const",
      "label": "参数区.值T11",
      "position": {
        "x": 1500,
        "y": 352
      },
      "data": {
        "mode": "text",
        "content": "HELLO",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "25",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T11",
      "position": {
        "x": 1800,
        "y": 352
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "26",
      "key": "protocol-concat",
      "label": "参数区.条目T11",
      "position": {
        "x": 2100,
        "y": 352
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "27",
      "key": "protocol-const",
      "label": "参数区.类型T12",
      "position": {
        "x": 2400,
        "y": 352
      },
      "data": {
        "mode": "hex",
        "content": "12",
        "width": 1
      }
    },
    {
      "id": "28",
      "key": "protocol-const",
      "label": "参数区.值T12",
      "position": {
        "x": 2700,
        "y": 352
      },
      "data": {
        "mode": "hex",
        "content": "0102030405",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "29",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T12",
      "position": {
        "x": 3000,
        "y": 352
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "30",
      "key": "protocol-concat",
      "label": "参数区.条目T12",
      "position": {
        "x": 3300,
        "y": 352
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "31",
      "key": "protocol-concat",
      "label": "参数区.合并",
      "position": {
        "x": 3600,
        "y": 352
      },
      "data": {
        "ports": 3
      }
    },
    {
      "id": "32",
      "key": "protocol-const",
      "label": "通道表.数量",
      "position": {
        "x": 0,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 1
      }
    },
    {
      "id": "33",
      "key": "protocol-const",
      "label": "通道表.块1.通道号",
      "position": {
        "x": 300,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "34",
      "key": "protocol-const",
      "label": "通道表.块1.通道值",
      "position": {
        "x": 600,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "101",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "35",
      "key": "protocol-const",
      "label": "通道表.块2.通道号",
      "position": {
        "x": 900,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "36",
      "key": "protocol-const",
      "label": "通道表.块2.通道值",
      "position": {
        "x": 1200,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "101",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "37",
      "key": "protocol-const",
      "label": "通道表.块3.通道号",
      "position": {
        "x": 1500,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "38",
      "key": "protocol-const",
      "label": "通道表.块3.通道值",
      "position": {
        "x": 1800,
        "y": 456
      },
      "data": {
        "mode": "decimal",
        "content": "101",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "39",
      "key": "protocol-concat",
      "label": "通道表.块拼接",
      "position": {
        "x": 2100,
        "y": 456
      },
      "data": {
        "ports": 7
      }
    },
    {
      "id": "40",
      "key": "protocol-concat",
      "label": "复杂协议v3.REQ.组帧",
      "position": {
        "x": 3600,
        "y": 144
      },
      "data": {
        "ports": 16
      }
    },
    {
      "id": "41",
      "key": "protocol-len-prefix",
      "label": "复杂协议v3.REQ.len",
      "position": {
        "x": 3900,
        "y": 144
      },
      "data": {
        "width": "u16"
      }
    },
    {
      "id": "42",
      "key": "protocol-crc",
      "label": "复杂协议v3.REQ.crc16",
      "position": {
        "x": 4200,
        "y": 144
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "是"
      }
    },
    {
      "id": "43",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.magic",
      "position": {
        "x": 0,
        "y": 1080
      },
      "data": {
        "mode": "hex",
        "content": "AA55",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "44",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.version",
      "position": {
        "x": 300,
        "y": 1080
      },
      "data": {
        "mode": "hex",
        "content": "03",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "45",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.msgType",
      "position": {
        "x": 600,
        "y": 1080
      },
      "data": {
        "mode": "decimal",
        "content": "2",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "46",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.seq",
      "position": {
        "x": 900,
        "y": 1080
      },
      "data": {
        "mode": "decimal",
        "content": "0",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "47",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.flags",
      "position": {
        "x": 1200,
        "y": 1080
      },
      "data": {
        "mode": "hex",
        "content": "FF",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "48",
      "key": "input-manual",
      "label": "复杂协议v3.ACK.控制字.优先级",
      "position": {
        "x": 1500,
        "y": 1184
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "49",
      "key": "input-manual",
      "label": "复杂协议v3.ACK.控制字.重试",
      "position": {
        "x": 1500,
        "y": 1288
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "50",
      "key": "input-manual",
      "label": "复杂协议v3.ACK.控制字.告警",
      "position": {
        "x": 1500,
        "y": 1392
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "51",
      "key": "protocol-bitfield",
      "label": "复杂协议v3.ACK.控制字",
      "position": {
        "x": 1500,
        "y": 1080
      },
      "data": {
        "mode": "打包",
        "fields": [
          {
            "id": "f0",
            "name": "优先级",
            "bits": 4
          },
          {
            "id": "f1",
            "name": "重试",
            "bits": 4
          },
          {
            "id": "f2",
            "name": "告警",
            "bits": 8
          }
        ]
      }
    },
    {
      "id": "52",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.命令码",
      "position": {
        "x": 1800,
        "y": 1080
      },
      "data": {
        "mode": "decimal",
        "content": "18",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "53",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.目标ID",
      "position": {
        "x": 2100,
        "y": 1080
      },
      "data": {
        "mode": "decimal",
        "content": "2",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "54",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.设备名",
      "position": {
        "x": 2400,
        "y": 1080
      },
      "data": {
        "mode": "text",
        "content": "STATION-B",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "55",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.传感器1",
      "position": {
        "x": 300,
        "y": 1184
      },
      "data": {
        "mode": "decimal",
        "content": "513",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "56",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.传感器2",
      "position": {
        "x": 600,
        "y": 1184
      },
      "data": {
        "mode": "decimal",
        "content": "514",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "57",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.传感器3",
      "position": {
        "x": 900,
        "y": 1184
      },
      "data": {
        "mode": "decimal",
        "content": "515",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "58",
      "key": "protocol-const",
      "label": "复杂协议v3.ACK.扩展时间.扩展时间",
      "position": {
        "x": 1200,
        "y": 1184
      },
      "data": {
        "mode": "decimal",
        "content": "270545472",
        "width": 4,
        "encoding": "utf8"
      }
    },
    {
      "id": "59",
      "key": "custom-aes-crypto",
      "label": "复杂协议v3.ACK.载荷加密",
      "position": {
        "x": 1500,
        "y": 1184
      },
      "data": {
        "mode": "encrypt",
        "key": "000102030405060708090A0B0C0D0E0F",
        "iv": "101112131415161718191A1B1C1D1E1F"
      }
    },
    {
      "id": "60",
      "key": "protocol-const",
      "label": "参数区.类型T10",
      "position": {
        "x": 0,
        "y": 1288
      },
      "data": {
        "mode": "hex",
        "content": "10",
        "width": 1
      }
    },
    {
      "id": "61",
      "key": "protocol-const",
      "label": "参数区.值T10",
      "position": {
        "x": 300,
        "y": 1288
      },
      "data": {
        "mode": "hex",
        "content": "AABBCC",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "62",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T10",
      "position": {
        "x": 600,
        "y": 1288
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "63",
      "key": "protocol-concat",
      "label": "参数区.条目T10",
      "position": {
        "x": 900,
        "y": 1288
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "64",
      "key": "protocol-const",
      "label": "参数区.类型T11",
      "position": {
        "x": 1200,
        "y": 1288
      },
      "data": {
        "mode": "hex",
        "content": "11",
        "width": 1
      }
    },
    {
      "id": "65",
      "key": "protocol-const",
      "label": "参数区.值T11",
      "position": {
        "x": 1500,
        "y": 1288
      },
      "data": {
        "mode": "text",
        "content": "HELLO",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "66",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T11",
      "position": {
        "x": 1800,
        "y": 1288
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "67",
      "key": "protocol-concat",
      "label": "参数区.条目T11",
      "position": {
        "x": 2100,
        "y": 1288
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "68",
      "key": "protocol-const",
      "label": "参数区.类型T12",
      "position": {
        "x": 2400,
        "y": 1288
      },
      "data": {
        "mode": "hex",
        "content": "12",
        "width": 1
      }
    },
    {
      "id": "69",
      "key": "protocol-const",
      "label": "参数区.值T12",
      "position": {
        "x": 2700,
        "y": 1288
      },
      "data": {
        "mode": "hex",
        "content": "0102030405",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "70",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T12",
      "position": {
        "x": 3000,
        "y": 1288
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "71",
      "key": "protocol-concat",
      "label": "参数区.条目T12",
      "position": {
        "x": 3300,
        "y": 1288
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "72",
      "key": "protocol-concat",
      "label": "参数区.合并",
      "position": {
        "x": 3600,
        "y": 1288
      },
      "data": {
        "ports": 3
      }
    },
    {
      "id": "73",
      "key": "protocol-const",
      "label": "通道表.数量",
      "position": {
        "x": 0,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 1
      }
    },
    {
      "id": "74",
      "key": "protocol-const",
      "label": "通道表.块1.通道号",
      "position": {
        "x": 300,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "75",
      "key": "protocol-const",
      "label": "通道表.块1.通道值",
      "position": {
        "x": 600,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "102",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "76",
      "key": "protocol-const",
      "label": "通道表.块2.通道号",
      "position": {
        "x": 900,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "77",
      "key": "protocol-const",
      "label": "通道表.块2.通道值",
      "position": {
        "x": 1200,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "102",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "78",
      "key": "protocol-const",
      "label": "通道表.块3.通道号",
      "position": {
        "x": 1500,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "79",
      "key": "protocol-const",
      "label": "通道表.块3.通道值",
      "position": {
        "x": 1800,
        "y": 1392
      },
      "data": {
        "mode": "decimal",
        "content": "102",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "80",
      "key": "protocol-concat",
      "label": "通道表.块拼接",
      "position": {
        "x": 2100,
        "y": 1392
      },
      "data": {
        "ports": 7
      }
    },
    {
      "id": "81",
      "key": "protocol-concat",
      "label": "复杂协议v3.ACK.组帧",
      "position": {
        "x": 3600,
        "y": 1080
      },
      "data": {
        "ports": 16
      }
    },
    {
      "id": "82",
      "key": "protocol-len-prefix",
      "label": "复杂协议v3.ACK.len",
      "position": {
        "x": 3900,
        "y": 1080
      },
      "data": {
        "width": "u16"
      }
    },
    {
      "id": "83",
      "key": "protocol-crc",
      "label": "复杂协议v3.ACK.crc16",
      "position": {
        "x": 4200,
        "y": 1080
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "是"
      }
    },
    {
      "id": "84",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.magic",
      "position": {
        "x": 0,
        "y": 2016
      },
      "data": {
        "mode": "hex",
        "content": "AA55",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "85",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.version",
      "position": {
        "x": 300,
        "y": 2016
      },
      "data": {
        "mode": "hex",
        "content": "03",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "86",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.msgType",
      "position": {
        "x": 600,
        "y": 2016
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "87",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.seq",
      "position": {
        "x": 900,
        "y": 2016
      },
      "data": {
        "mode": "decimal",
        "content": "0",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "88",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.flags",
      "position": {
        "x": 1200,
        "y": 2016
      },
      "data": {
        "mode": "hex",
        "content": "FF",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "89",
      "key": "input-manual",
      "label": "复杂协议v3.EVENT.控制字.优先级",
      "position": {
        "x": 1500,
        "y": 2120
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "90",
      "key": "input-manual",
      "label": "复杂协议v3.EVENT.控制字.重试",
      "position": {
        "x": 1500,
        "y": 2224
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "91",
      "key": "input-manual",
      "label": "复杂协议v3.EVENT.控制字.告警",
      "position": {
        "x": 1500,
        "y": 2328
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "92",
      "key": "protocol-bitfield",
      "label": "复杂协议v3.EVENT.控制字",
      "position": {
        "x": 1500,
        "y": 2016
      },
      "data": {
        "mode": "打包",
        "fields": [
          {
            "id": "f0",
            "name": "优先级",
            "bits": 4
          },
          {
            "id": "f1",
            "name": "重试",
            "bits": 4
          },
          {
            "id": "f2",
            "name": "告警",
            "bits": 8
          }
        ]
      }
    },
    {
      "id": "93",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.命令码",
      "position": {
        "x": 1800,
        "y": 2016
      },
      "data": {
        "mode": "decimal",
        "content": "19",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "94",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.目标ID",
      "position": {
        "x": 2100,
        "y": 2016
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "95",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.设备名",
      "position": {
        "x": 2400,
        "y": 2016
      },
      "data": {
        "mode": "text",
        "content": "STATION-C",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "96",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.传感器1",
      "position": {
        "x": 300,
        "y": 2120
      },
      "data": {
        "mode": "decimal",
        "content": "769",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "97",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.传感器2",
      "position": {
        "x": 600,
        "y": 2120
      },
      "data": {
        "mode": "decimal",
        "content": "770",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "98",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.传感器3",
      "position": {
        "x": 900,
        "y": 2120
      },
      "data": {
        "mode": "decimal",
        "content": "771",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "99",
      "key": "protocol-const",
      "label": "复杂协议v3.EVENT.扩展时间.扩展时间",
      "position": {
        "x": 1200,
        "y": 2120
      },
      "data": {
        "mode": "decimal",
        "content": "270545728",
        "width": 4,
        "encoding": "utf8"
      }
    },
    {
      "id": "100",
      "key": "custom-aes-crypto",
      "label": "复杂协议v3.EVENT.载荷加密",
      "position": {
        "x": 1500,
        "y": 2120
      },
      "data": {
        "mode": "encrypt",
        "key": "000102030405060708090A0B0C0D0E0F",
        "iv": "101112131415161718191A1B1C1D1E1F"
      }
    },
    {
      "id": "101",
      "key": "protocol-const",
      "label": "参数区.类型T10",
      "position": {
        "x": 0,
        "y": 2224
      },
      "data": {
        "mode": "hex",
        "content": "10",
        "width": 1
      }
    },
    {
      "id": "102",
      "key": "protocol-const",
      "label": "参数区.值T10",
      "position": {
        "x": 300,
        "y": 2224
      },
      "data": {
        "mode": "hex",
        "content": "AABBCC",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "103",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T10",
      "position": {
        "x": 600,
        "y": 2224
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "104",
      "key": "protocol-concat",
      "label": "参数区.条目T10",
      "position": {
        "x": 900,
        "y": 2224
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "105",
      "key": "protocol-const",
      "label": "参数区.类型T11",
      "position": {
        "x": 1200,
        "y": 2224
      },
      "data": {
        "mode": "hex",
        "content": "11",
        "width": 1
      }
    },
    {
      "id": "106",
      "key": "protocol-const",
      "label": "参数区.值T11",
      "position": {
        "x": 1500,
        "y": 2224
      },
      "data": {
        "mode": "text",
        "content": "HELLO",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "107",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T11",
      "position": {
        "x": 1800,
        "y": 2224
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "108",
      "key": "protocol-concat",
      "label": "参数区.条目T11",
      "position": {
        "x": 2100,
        "y": 2224
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "109",
      "key": "protocol-const",
      "label": "参数区.类型T12",
      "position": {
        "x": 2400,
        "y": 2224
      },
      "data": {
        "mode": "hex",
        "content": "12",
        "width": 1
      }
    },
    {
      "id": "110",
      "key": "protocol-const",
      "label": "参数区.值T12",
      "position": {
        "x": 2700,
        "y": 2224
      },
      "data": {
        "mode": "hex",
        "content": "0102030405",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "111",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T12",
      "position": {
        "x": 3000,
        "y": 2224
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "112",
      "key": "protocol-concat",
      "label": "参数区.条目T12",
      "position": {
        "x": 3300,
        "y": 2224
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "113",
      "key": "protocol-concat",
      "label": "参数区.合并",
      "position": {
        "x": 3600,
        "y": 2224
      },
      "data": {
        "ports": 3
      }
    },
    {
      "id": "114",
      "key": "protocol-const",
      "label": "通道表.数量",
      "position": {
        "x": 0,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 1
      }
    },
    {
      "id": "115",
      "key": "protocol-const",
      "label": "通道表.块1.通道号",
      "position": {
        "x": 300,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "116",
      "key": "protocol-const",
      "label": "通道表.块1.通道值",
      "position": {
        "x": 600,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "103",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "117",
      "key": "protocol-const",
      "label": "通道表.块2.通道号",
      "position": {
        "x": 900,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "118",
      "key": "protocol-const",
      "label": "通道表.块2.通道值",
      "position": {
        "x": 1200,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "103",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "119",
      "key": "protocol-const",
      "label": "通道表.块3.通道号",
      "position": {
        "x": 1500,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "120",
      "key": "protocol-const",
      "label": "通道表.块3.通道值",
      "position": {
        "x": 1800,
        "y": 2328
      },
      "data": {
        "mode": "decimal",
        "content": "103",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "121",
      "key": "protocol-concat",
      "label": "通道表.块拼接",
      "position": {
        "x": 2100,
        "y": 2328
      },
      "data": {
        "ports": 7
      }
    },
    {
      "id": "122",
      "key": "protocol-concat",
      "label": "复杂协议v3.EVENT.组帧",
      "position": {
        "x": 3600,
        "y": 2016
      },
      "data": {
        "ports": 16
      }
    },
    {
      "id": "123",
      "key": "protocol-len-prefix",
      "label": "复杂协议v3.EVENT.len",
      "position": {
        "x": 3900,
        "y": 2016
      },
      "data": {
        "width": "u16"
      }
    },
    {
      "id": "124",
      "key": "protocol-crc",
      "label": "复杂协议v3.EVENT.crc16",
      "position": {
        "x": 4200,
        "y": 2016
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "是"
      }
    },
    {
      "id": "125",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.magic",
      "position": {
        "x": 0,
        "y": 2952
      },
      "data": {
        "mode": "hex",
        "content": "AA55",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "126",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.version",
      "position": {
        "x": 300,
        "y": 2952
      },
      "data": {
        "mode": "hex",
        "content": "03",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "127",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.msgType",
      "position": {
        "x": 600,
        "y": 2952
      },
      "data": {
        "mode": "decimal",
        "content": "4",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "128",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.seq",
      "position": {
        "x": 900,
        "y": 2952
      },
      "data": {
        "mode": "decimal",
        "content": "0",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "129",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.flags",
      "position": {
        "x": 1200,
        "y": 2952
      },
      "data": {
        "mode": "hex",
        "content": "FF",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "130",
      "key": "input-manual",
      "label": "复杂协议v3.NACK.控制字.优先级",
      "position": {
        "x": 1500,
        "y": 3056
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "131",
      "key": "input-manual",
      "label": "复杂协议v3.NACK.控制字.重试",
      "position": {
        "x": 1500,
        "y": 3160
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "132",
      "key": "input-manual",
      "label": "复杂协议v3.NACK.控制字.告警",
      "position": {
        "x": 1500,
        "y": 3264
      },
      "data": {
        "content": "0",
        "mode": "text"
      }
    },
    {
      "id": "133",
      "key": "protocol-bitfield",
      "label": "复杂协议v3.NACK.控制字",
      "position": {
        "x": 1500,
        "y": 2952
      },
      "data": {
        "mode": "打包",
        "fields": [
          {
            "id": "f0",
            "name": "优先级",
            "bits": 4
          },
          {
            "id": "f1",
            "name": "重试",
            "bits": 4
          },
          {
            "id": "f2",
            "name": "告警",
            "bits": 8
          }
        ]
      }
    },
    {
      "id": "134",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.命令码",
      "position": {
        "x": 1800,
        "y": 2952
      },
      "data": {
        "mode": "decimal",
        "content": "20",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "135",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.目标ID",
      "position": {
        "x": 2100,
        "y": 2952
      },
      "data": {
        "mode": "decimal",
        "content": "4",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "136",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.设备名",
      "position": {
        "x": 2400,
        "y": 2952
      },
      "data": {
        "mode": "text",
        "content": "STATION-D",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "137",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.传感器1",
      "position": {
        "x": 300,
        "y": 3056
      },
      "data": {
        "mode": "decimal",
        "content": "1025",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "138",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.传感器2",
      "position": {
        "x": 600,
        "y": 3056
      },
      "data": {
        "mode": "decimal",
        "content": "1026",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "139",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.传感器3",
      "position": {
        "x": 900,
        "y": 3056
      },
      "data": {
        "mode": "decimal",
        "content": "1027",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "140",
      "key": "protocol-const",
      "label": "复杂协议v3.NACK.扩展时间.扩展时间",
      "position": {
        "x": 1200,
        "y": 3056
      },
      "data": {
        "mode": "decimal",
        "content": "270545984",
        "width": 4,
        "encoding": "utf8"
      }
    },
    {
      "id": "141",
      "key": "custom-aes-crypto",
      "label": "复杂协议v3.NACK.载荷加密",
      "position": {
        "x": 1500,
        "y": 3056
      },
      "data": {
        "mode": "encrypt",
        "key": "000102030405060708090A0B0C0D0E0F",
        "iv": "101112131415161718191A1B1C1D1E1F"
      }
    },
    {
      "id": "142",
      "key": "protocol-const",
      "label": "参数区.类型T10",
      "position": {
        "x": 0,
        "y": 3160
      },
      "data": {
        "mode": "hex",
        "content": "10",
        "width": 1
      }
    },
    {
      "id": "143",
      "key": "protocol-const",
      "label": "参数区.值T10",
      "position": {
        "x": 300,
        "y": 3160
      },
      "data": {
        "mode": "hex",
        "content": "AABBCC",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "144",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T10",
      "position": {
        "x": 600,
        "y": 3160
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "145",
      "key": "protocol-concat",
      "label": "参数区.条目T10",
      "position": {
        "x": 900,
        "y": 3160
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "146",
      "key": "protocol-const",
      "label": "参数区.类型T11",
      "position": {
        "x": 1200,
        "y": 3160
      },
      "data": {
        "mode": "hex",
        "content": "11",
        "width": 1
      }
    },
    {
      "id": "147",
      "key": "protocol-const",
      "label": "参数区.值T11",
      "position": {
        "x": 1500,
        "y": 3160
      },
      "data": {
        "mode": "text",
        "content": "HELLO",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "148",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T11",
      "position": {
        "x": 1800,
        "y": 3160
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "149",
      "key": "protocol-concat",
      "label": "参数区.条目T11",
      "position": {
        "x": 2100,
        "y": 3160
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "150",
      "key": "protocol-const",
      "label": "参数区.类型T12",
      "position": {
        "x": 2400,
        "y": 3160
      },
      "data": {
        "mode": "hex",
        "content": "12",
        "width": 1
      }
    },
    {
      "id": "151",
      "key": "protocol-const",
      "label": "参数区.值T12",
      "position": {
        "x": 2700,
        "y": 3160
      },
      "data": {
        "mode": "hex",
        "content": "0102030405",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "152",
      "key": "protocol-len-prefix",
      "label": "参数区.长度T12",
      "position": {
        "x": 3000,
        "y": 3160
      },
      "data": {
        "width": "u8"
      }
    },
    {
      "id": "153",
      "key": "protocol-concat",
      "label": "参数区.条目T12",
      "position": {
        "x": 3300,
        "y": 3160
      },
      "data": {
        "ports": 2
      }
    },
    {
      "id": "154",
      "key": "protocol-concat",
      "label": "参数区.合并",
      "position": {
        "x": 3600,
        "y": 3160
      },
      "data": {
        "ports": 3
      }
    },
    {
      "id": "155",
      "key": "protocol-const",
      "label": "通道表.数量",
      "position": {
        "x": 0,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "3",
        "width": 1
      }
    },
    {
      "id": "156",
      "key": "protocol-const",
      "label": "通道表.块1.通道号",
      "position": {
        "x": 300,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "157",
      "key": "protocol-const",
      "label": "通道表.块1.通道值",
      "position": {
        "x": 600,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "104",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "158",
      "key": "protocol-const",
      "label": "通道表.块2.通道号",
      "position": {
        "x": 900,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "159",
      "key": "protocol-const",
      "label": "通道表.块2.通道值",
      "position": {
        "x": 1200,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "104",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "160",
      "key": "protocol-const",
      "label": "通道表.块3.通道号",
      "position": {
        "x": 1500,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "1",
        "width": 1,
        "encoding": "utf8"
      }
    },
    {
      "id": "161",
      "key": "protocol-const",
      "label": "通道表.块3.通道值",
      "position": {
        "x": 1800,
        "y": 3264
      },
      "data": {
        "mode": "decimal",
        "content": "104",
        "width": 2,
        "encoding": "utf8"
      }
    },
    {
      "id": "162",
      "key": "protocol-concat",
      "label": "通道表.块拼接",
      "position": {
        "x": 2100,
        "y": 3264
      },
      "data": {
        "ports": 7
      }
    },
    {
      "id": "163",
      "key": "protocol-concat",
      "label": "复杂协议v3.NACK.组帧",
      "position": {
        "x": 3600,
        "y": 2952
      },
      "data": {
        "ports": 16
      }
    },
    {
      "id": "164",
      "key": "protocol-len-prefix",
      "label": "复杂协议v3.NACK.len",
      "position": {
        "x": 3900,
        "y": 2952
      },
      "data": {
        "width": "u16"
      }
    },
    {
      "id": "165",
      "key": "protocol-crc",
      "label": "复杂协议v3.NACK.crc16",
      "position": {
        "x": 4200,
        "y": 2952
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "是"
      }
    },
    {
      "id": "166",
      "key": "numeric-calc",
      "label": "复杂协议v3.进度取余100",
      "position": {
        "x": 300,
        "y": 40
      },
      "data": {
        "operator": "取余",
        "operand2": "100"
      }
    },
    {
      "id": "167",
      "key": "compare-eq",
      "label": "复杂协议v3.进度到点?",
      "position": {
        "x": 600,
        "y": 40
      },
      "data": {
        "operand": "0"
      }
    },
    {
      "id": "168",
      "key": "control-if",
      "label": "复杂协议v3.进度分支",
      "position": {
        "x": 900,
        "y": 40
      },
      "data": {}
    },
    {
      "id": "169",
      "key": "input-manual",
      "label": "复杂协议v3.进度标记",
      "position": {
        "x": 1200,
        "y": 40
      },
      "data": {
        "content": "✓",
        "mode": "text"
      }
    },
    {
      "id": "170",
      "key": "output-log",
      "label": "复杂协议v3.日志.进度",
      "position": {
        "x": 1500,
        "y": 40
      },
      "data": {
        "prefix": "复杂协议v3.进度·每100帧",
        "level": "info"
      }
    },
    {
      "id": "171",
      "key": "input-manual",
      "label": "复杂协议v3.端口(改这里)",
      "position": {
        "x": 0,
        "y": 3888
      },
      "data": {
        "content": "39189",
        "mode": "text"
      }
    },
    {
      "id": "172",
      "key": "output-tcp",
      "label": "复杂协议v3.REQ.发送",
      "position": {
        "x": 3900,
        "y": 144
      },
      "data": {
        "host": "127.0.0.1",
        "mode": "hex"
      }
    },
    {
      "id": "173",
      "key": "output-tcp",
      "label": "复杂协议v3.ACK.发送",
      "position": {
        "x": 3900,
        "y": 1080
      },
      "data": {
        "host": "127.0.0.1",
        "mode": "hex"
      }
    },
    {
      "id": "174",
      "key": "output-tcp",
      "label": "复杂协议v3.EVENT.发送",
      "position": {
        "x": 3900,
        "y": 2016
      },
      "data": {
        "host": "127.0.0.1",
        "mode": "hex"
      }
    },
    {
      "id": "175",
      "key": "output-tcp",
      "label": "复杂协议v3.NACK.发送",
      "position": {
        "x": 3900,
        "y": 2952
      },
      "data": {
        "host": "127.0.0.1",
        "mode": "hex"
      }
    },
    {
      "id": "176",
      "key": "input-manual",
      "label": "复杂协议v3.端口说明",
      "position": {
        "x": 0,
        "y": 3992
      },
      "data": {
        "content": "端口填写：改「复杂协议v3.端口(改这里)」节点的 content 为本地 TCP 面板端口（当前 39189），所有发送/接收节点自动同步",
        "mode": "text"
      }
    },
    {
      "id": "177",
      "key": "input-tcp",
      "label": "复杂协议v3.接收",
      "position": {
        "x": 0,
        "y": 3992
      },
      "data": {
        "host": "127.0.0.1"
      }
    },
    {
      "id": "178",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.msgType",
      "position": {
        "x": 300,
        "y": 3992
      },
      "data": {
        "start": 5,
        "length": 1
      }
    },
    {
      "id": "179",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.msgType值",
      "position": {
        "x": 600,
        "y": 3992
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "180",
      "key": "string-template",
      "label": "复杂协议v3.日志.msgType",
      "position": {
        "x": 900,
        "y": 3992
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.msgType] {1}\n"
      }
    },
    {
      "id": "181",
      "key": "output-file",
      "label": "复杂协议v3.日志.msgType.落盘",
      "position": {
        "x": 1200,
        "y": 3992
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "182",
      "key": "protocol-slice",
      "label": "复杂协议v3.len",
      "position": {
        "x": 0,
        "y": 4200
      },
      "data": {
        "start": 0,
        "length": 2
      }
    },
    {
      "id": "183",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.len值",
      "position": {
        "x": 300,
        "y": 4200
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "184",
      "key": "string-template",
      "label": "复杂协议v3.日志.len",
      "position": {
        "x": 600,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.len] {1}\n"
      }
    },
    {
      "id": "185",
      "key": "output-file",
      "label": "复杂协议v3.日志.len.落盘",
      "position": {
        "x": 900,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "186",
      "key": "protocol-slice",
      "label": "复杂协议v3.body(动态)",
      "position": {
        "x": 1200,
        "y": 4200
      },
      "data": {
        "start": 2,
        "length": 0
      }
    },
    {
      "id": "187",
      "key": "string-template",
      "label": "复杂协议v3.日志.body",
      "position": {
        "x": 1500,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.body] {1}\n"
      }
    },
    {
      "id": "188",
      "key": "output-file",
      "label": "复杂协议v3.日志.body.落盘",
      "position": {
        "x": 1800,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "189",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.magic",
      "position": {
        "x": 0,
        "y": 4200
      },
      "data": {
        "start": 2,
        "length": 2
      }
    },
    {
      "id": "190",
      "key": "string-template",
      "label": "复杂协议v3.日志.magic",
      "position": {
        "x": 300,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.magic] {1}\n"
      }
    },
    {
      "id": "191",
      "key": "output-file",
      "label": "复杂协议v3.日志.magic.落盘",
      "position": {
        "x": 600,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "192",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.version",
      "position": {
        "x": 900,
        "y": 4200
      },
      "data": {
        "start": 4,
        "length": 1
      }
    },
    {
      "id": "193",
      "key": "string-template",
      "label": "复杂协议v3.日志.version",
      "position": {
        "x": 1200,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.version] {1}\n"
      }
    },
    {
      "id": "194",
      "key": "output-file",
      "label": "复杂协议v3.日志.version.落盘",
      "position": {
        "x": 1500,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "195",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.msgType",
      "position": {
        "x": 1800,
        "y": 4200
      },
      "data": {
        "start": 5,
        "length": 1
      }
    },
    {
      "id": "196",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.msgType",
      "position": {
        "x": 2100,
        "y": 4200
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "197",
      "key": "string-template",
      "label": "复杂协议v3.日志.msgType",
      "position": {
        "x": 2400,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.msgType] {1}\n"
      }
    },
    {
      "id": "198",
      "key": "output-file",
      "label": "复杂协议v3.日志.msgType.落盘",
      "position": {
        "x": 2700,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "199",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.seq",
      "position": {
        "x": 2700,
        "y": 4200
      },
      "data": {
        "start": 6,
        "length": 2
      }
    },
    {
      "id": "200",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.seq",
      "position": {
        "x": 3000,
        "y": 4200
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "201",
      "key": "string-template",
      "label": "复杂协议v3.日志.seq",
      "position": {
        "x": 3300,
        "y": 4200
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.seq] {1}\n"
      }
    },
    {
      "id": "202",
      "key": "output-file",
      "label": "复杂协议v3.日志.seq.落盘",
      "position": {
        "x": 3600,
        "y": 4200
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "203",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.flags",
      "position": {
        "x": 0,
        "y": 4408
      },
      "data": {
        "start": 8,
        "length": 1
      }
    },
    {
      "id": "204",
      "key": "string-template",
      "label": "复杂协议v3.日志.flags",
      "position": {
        "x": 300,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.flags] {1}\n"
      }
    },
    {
      "id": "205",
      "key": "output-file",
      "label": "复杂协议v3.日志.flags.落盘",
      "position": {
        "x": 600,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "206",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.控制字",
      "position": {
        "x": 0,
        "y": 4408
      },
      "data": {
        "start": 9,
        "length": 2
      }
    },
    {
      "id": "207",
      "key": "protocol-bitfield",
      "label": "复杂协议v3.解包.控制字",
      "position": {
        "x": 300,
        "y": 4408
      },
      "data": {
        "mode": "解包",
        "fields": [
          {
            "id": "f0",
            "name": "优先级",
            "bits": 4
          },
          {
            "id": "f1",
            "name": "重试",
            "bits": 4
          },
          {
            "id": "f2",
            "name": "告警",
            "bits": 8
          }
        ]
      }
    },
    {
      "id": "208",
      "key": "string-template",
      "label": "复杂协议v3.日志.控制字.优先级",
      "position": {
        "x": 600,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.控制字.优先级] {1}\n"
      }
    },
    {
      "id": "209",
      "key": "output-file",
      "label": "复杂协议v3.日志.控制字.优先级.落盘",
      "position": {
        "x": 900,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "210",
      "key": "string-template",
      "label": "复杂协议v3.日志.控制字.重试",
      "position": {
        "x": 1200,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.控制字.重试] {1}\n"
      }
    },
    {
      "id": "211",
      "key": "output-file",
      "label": "复杂协议v3.日志.控制字.重试.落盘",
      "position": {
        "x": 1500,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "212",
      "key": "string-template",
      "label": "复杂协议v3.日志.控制字.告警",
      "position": {
        "x": 1800,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.控制字.告警] {1}\n"
      }
    },
    {
      "id": "213",
      "key": "output-file",
      "label": "复杂协议v3.日志.控制字.告警.落盘",
      "position": {
        "x": 2100,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "214",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.命令码",
      "position": {
        "x": 900,
        "y": 4408
      },
      "data": {
        "start": 11,
        "length": 2
      }
    },
    {
      "id": "215",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.命令码",
      "position": {
        "x": 1200,
        "y": 4408
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "216",
      "key": "string-template",
      "label": "复杂协议v3.日志.命令码",
      "position": {
        "x": 1500,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.命令码] {1}\n"
      }
    },
    {
      "id": "217",
      "key": "output-file",
      "label": "复杂协议v3.日志.命令码.落盘",
      "position": {
        "x": 1800,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "218",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.目标ID",
      "position": {
        "x": 1800,
        "y": 4408
      },
      "data": {
        "start": 13,
        "length": 2
      }
    },
    {
      "id": "219",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.目标ID",
      "position": {
        "x": 2100,
        "y": 4408
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "220",
      "key": "string-template",
      "label": "复杂协议v3.日志.目标ID",
      "position": {
        "x": 2400,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.目标ID] {1}\n"
      }
    },
    {
      "id": "221",
      "key": "output-file",
      "label": "复杂协议v3.日志.目标ID.落盘",
      "position": {
        "x": 2700,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "222",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.设备名",
      "position": {
        "x": 2700,
        "y": 4408
      },
      "data": {
        "start": 15,
        "length": 9
      }
    },
    {
      "id": "223",
      "key": "protocol-decode-text",
      "label": "复杂协议v3.解码.设备名",
      "position": {
        "x": 3000,
        "y": 4408
      },
      "data": {
        "encoding": "utf8"
      }
    },
    {
      "id": "224",
      "key": "string-template",
      "label": "复杂协议v3.日志.设备名",
      "position": {
        "x": 3300,
        "y": 4408
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.设备名] {1}\n"
      }
    },
    {
      "id": "225",
      "key": "output-file",
      "label": "复杂协议v3.日志.设备名.落盘",
      "position": {
        "x": 3600,
        "y": 4408
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "226",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T10.类型",
      "position": {
        "x": 0,
        "y": 4616
      },
      "data": {
        "start": 24,
        "length": 1
      }
    },
    {
      "id": "227",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T10.类型值",
      "position": {
        "x": 300,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "228",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T10.类型",
      "position": {
        "x": 600,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.T10] {1}\n"
      }
    },
    {
      "id": "229",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T10.类型.落盘",
      "position": {
        "x": 900,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "230",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T10.长度",
      "position": {
        "x": 1200,
        "y": 4616
      },
      "data": {
        "start": 25,
        "length": 1
      }
    },
    {
      "id": "231",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T10.长度值",
      "position": {
        "x": 1500,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "232",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T10.长度",
      "position": {
        "x": 1800,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.长度] {1}\n"
      }
    },
    {
      "id": "233",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T10.长度.落盘",
      "position": {
        "x": 2100,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "234",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T10.值",
      "position": {
        "x": 2400,
        "y": 4616
      },
      "data": {
        "start": 26,
        "length": 0
      }
    },
    {
      "id": "235",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T10.值",
      "position": {
        "x": 2700,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.值T10] {1}\n"
      }
    },
    {
      "id": "236",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T10.值.落盘",
      "position": {
        "x": 3000,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "237",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T11.类型",
      "position": {
        "x": 3300,
        "y": 4616
      },
      "data": {
        "start": 29,
        "length": 1
      }
    },
    {
      "id": "238",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T11.类型值",
      "position": {
        "x": 3600,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "239",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T11.类型",
      "position": {
        "x": 3900,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.T11] {1}\n"
      }
    },
    {
      "id": "240",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T11.类型.落盘",
      "position": {
        "x": 4200,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "241",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T11.长度",
      "position": {
        "x": 4500,
        "y": 4616
      },
      "data": {
        "start": 30,
        "length": 1
      }
    },
    {
      "id": "242",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T11.长度值",
      "position": {
        "x": 4800,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "243",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T11.长度",
      "position": {
        "x": 5100,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.长度] {1}\n"
      }
    },
    {
      "id": "244",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T11.长度.落盘",
      "position": {
        "x": 5400,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "245",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T11.值",
      "position": {
        "x": 5700,
        "y": 4616
      },
      "data": {
        "start": 31,
        "length": 0
      }
    },
    {
      "id": "246",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T11.值",
      "position": {
        "x": 6000,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.值T11] {1}\n"
      }
    },
    {
      "id": "247",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T11.值.落盘",
      "position": {
        "x": 6300,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "248",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T12.类型",
      "position": {
        "x": 6600,
        "y": 4616
      },
      "data": {
        "start": 36,
        "length": 1
      }
    },
    {
      "id": "249",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T12.类型值",
      "position": {
        "x": 6900,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "250",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T12.类型",
      "position": {
        "x": 7200,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.T12] {1}\n"
      }
    },
    {
      "id": "251",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T12.类型.落盘",
      "position": {
        "x": 7500,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "252",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T12.长度",
      "position": {
        "x": 7800,
        "y": 4616
      },
      "data": {
        "start": 37,
        "length": 1
      }
    },
    {
      "id": "253",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.参数区.T12.长度值",
      "position": {
        "x": 8100,
        "y": 4616
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "254",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T12.长度",
      "position": {
        "x": 8400,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.长度] {1}\n"
      }
    },
    {
      "id": "255",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T12.长度.落盘",
      "position": {
        "x": 8700,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "256",
      "key": "protocol-slice",
      "label": "复杂协议v3.参数区.T12.值",
      "position": {
        "x": 9000,
        "y": 4616
      },
      "data": {
        "start": 38,
        "length": 0
      }
    },
    {
      "id": "257",
      "key": "string-template",
      "label": "复杂协议v3.日志.参数区.T12.值",
      "position": {
        "x": 9300,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.参数区.值T12] {1}\n"
      }
    },
    {
      "id": "258",
      "key": "output-file",
      "label": "复杂协议v3.日志.参数区.T12.值.落盘",
      "position": {
        "x": 9600,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "259",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.数量",
      "position": {
        "x": 0,
        "y": 4824
      },
      "data": {
        "start": 43,
        "length": 1
      }
    },
    {
      "id": "260",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.通道表.数量值",
      "position": {
        "x": 300,
        "y": 4824
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "261",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.数量",
      "position": {
        "x": 600,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.数量] {1}\n"
      }
    },
    {
      "id": "262",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.数量.落盘",
      "position": {
        "x": 900,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "263",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块1.通道号",
      "position": {
        "x": 1200,
        "y": 4824
      },
      "data": {
        "start": 44,
        "length": 1
      }
    },
    {
      "id": "264",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块1.通道号",
      "position": {
        "x": 1500,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块1.通道号] {1}\n"
      }
    },
    {
      "id": "265",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块1.通道号.落盘",
      "position": {
        "x": 1800,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "266",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块1.通道值",
      "position": {
        "x": 2100,
        "y": 4824
      },
      "data": {
        "start": 45,
        "length": 2
      }
    },
    {
      "id": "267",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块1.通道值",
      "position": {
        "x": 2400,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块1.通道值] {1}\n"
      }
    },
    {
      "id": "268",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块1.通道值.落盘",
      "position": {
        "x": 2700,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "269",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块2.通道号",
      "position": {
        "x": 3000,
        "y": 4824
      },
      "data": {
        "start": 47,
        "length": 1
      }
    },
    {
      "id": "270",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块2.通道号",
      "position": {
        "x": 3300,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块2.通道号] {1}\n"
      }
    },
    {
      "id": "271",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块2.通道号.落盘",
      "position": {
        "x": 3600,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "272",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块2.通道值",
      "position": {
        "x": 3900,
        "y": 4824
      },
      "data": {
        "start": 48,
        "length": 2
      }
    },
    {
      "id": "273",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块2.通道值",
      "position": {
        "x": 4200,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块2.通道值] {1}\n"
      }
    },
    {
      "id": "274",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块2.通道值.落盘",
      "position": {
        "x": 4500,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "275",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块3.通道号",
      "position": {
        "x": 4800,
        "y": 4824
      },
      "data": {
        "start": 50,
        "length": 1
      }
    },
    {
      "id": "276",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块3.通道号",
      "position": {
        "x": 5100,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块3.通道号] {1}\n"
      }
    },
    {
      "id": "277",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块3.通道号.落盘",
      "position": {
        "x": 5400,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "278",
      "key": "protocol-slice",
      "label": "复杂协议v3.通道表.块3.通道值",
      "position": {
        "x": 5700,
        "y": 4824
      },
      "data": {
        "start": 51,
        "length": 2
      }
    },
    {
      "id": "279",
      "key": "string-template",
      "label": "复杂协议v3.日志.通道表.块3.通道值",
      "position": {
        "x": 6000,
        "y": 4824
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.通道表.块3.通道值] {1}\n"
      }
    },
    {
      "id": "280",
      "key": "output-file",
      "label": "复杂协议v3.日志.通道表.块3.通道值.落盘",
      "position": {
        "x": 6300,
        "y": 4824
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "281",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.传感器1",
      "position": {
        "x": 0,
        "y": 4616
      },
      "data": {
        "start": 53,
        "length": 2
      }
    },
    {
      "id": "282",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.传感器1",
      "position": {
        "x": 300,
        "y": 4616
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "283",
      "key": "string-template",
      "label": "复杂协议v3.日志.传感器1",
      "position": {
        "x": 600,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.传感器1] {1}\n"
      }
    },
    {
      "id": "284",
      "key": "output-file",
      "label": "复杂协议v3.日志.传感器1.落盘",
      "position": {
        "x": 900,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "285",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.传感器2",
      "position": {
        "x": 900,
        "y": 4616
      },
      "data": {
        "start": 55,
        "length": 2
      }
    },
    {
      "id": "286",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.传感器2",
      "position": {
        "x": 1200,
        "y": 4616
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "287",
      "key": "string-template",
      "label": "复杂协议v3.日志.传感器2",
      "position": {
        "x": 1500,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.传感器2] {1}\n"
      }
    },
    {
      "id": "288",
      "key": "output-file",
      "label": "复杂协议v3.日志.传感器2.落盘",
      "position": {
        "x": 1800,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "289",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.传感器3",
      "position": {
        "x": 1800,
        "y": 4616
      },
      "data": {
        "start": 57,
        "length": 2
      }
    },
    {
      "id": "290",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.解析.传感器3",
      "position": {
        "x": 2100,
        "y": 4616
      },
      "data": {
        "width": 2,
        "endian": "大端"
      }
    },
    {
      "id": "291",
      "key": "string-template",
      "label": "复杂协议v3.日志.传感器3",
      "position": {
        "x": 2400,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.传感器3] {1}\n"
      }
    },
    {
      "id": "292",
      "key": "output-file",
      "label": "复杂协议v3.日志.传感器3.落盘",
      "position": {
        "x": 2700,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "293",
      "key": "protocol-slice",
      "label": "复杂协议v3.扩展时间.标志位",
      "position": {
        "x": 0,
        "y": 5032
      },
      "data": {
        "start": 8,
        "length": 1
      }
    },
    {
      "id": "294",
      "key": "protocol-parse-u",
      "label": "复杂协议v3.扩展时间.标志值",
      "position": {
        "x": 300,
        "y": 5032
      },
      "data": {
        "width": 1,
        "endian": "大端"
      }
    },
    {
      "id": "295",
      "key": "numeric-calc",
      "label": "复杂协议v3.扩展时间.掩码",
      "position": {
        "x": 600,
        "y": 5032
      },
      "data": {
        "operator": "与",
        "operand2": "1"
      }
    },
    {
      "id": "296",
      "key": "compare-neq",
      "label": "复杂协议v3.扩展时间.存在?",
      "position": {
        "x": 900,
        "y": 5032
      },
      "data": {
        "operand": "0"
      }
    },
    {
      "id": "297",
      "key": "string-template",
      "label": "复杂协议v3.日志.扩展时间存在",
      "position": {
        "x": 1200,
        "y": 5032
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.扩展时间存在] {1}\n"
      }
    },
    {
      "id": "298",
      "key": "output-file",
      "label": "复杂协议v3.日志.扩展时间存在.落盘",
      "position": {
        "x": 1500,
        "y": 5032
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "299",
      "key": "protocol-slice",
      "label": "复杂协议v3.扩展时间.字段",
      "position": {
        "x": 1800,
        "y": 5032
      },
      "data": {
        "start": 59,
        "length": 4
      }
    },
    {
      "id": "300",
      "key": "string-template",
      "label": "复杂协议v3.日志.扩展时间",
      "position": {
        "x": 2100,
        "y": 5032
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.扩展时间] {1}\n"
      }
    },
    {
      "id": "301",
      "key": "output-file",
      "label": "复杂协议v3.日志.扩展时间.落盘",
      "position": {
        "x": 2400,
        "y": 5032
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "302",
      "key": "protocol-slice",
      "label": "复杂协议v3.拆.载荷加密",
      "position": {
        "x": 2700,
        "y": 4616
      },
      "data": {
        "start": 63,
        "length": 16
      }
    },
    {
      "id": "303",
      "key": "string-template",
      "label": "复杂协议v3.日志.载荷加密",
      "position": {
        "x": 3000,
        "y": 4616
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.载荷加密] {1}\n"
      }
    },
    {
      "id": "304",
      "key": "output-file",
      "label": "复杂协议v3.日志.载荷加密.落盘",
      "position": {
        "x": 3300,
        "y": 4616
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "305",
      "key": "protocol-slice",
      "label": "复杂协议v3.crc16",
      "position": {
        "x": 0,
        "y": 5240
      },
      "data": {
        "start": 79,
        "length": 2
      }
    },
    {
      "id": "306",
      "key": "string-template",
      "label": "复杂协议v3.日志.crc16",
      "position": {
        "x": 300,
        "y": 5240
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.crc16] {1}\n"
      }
    },
    {
      "id": "307",
      "key": "output-file",
      "label": "复杂协议v3.日志.crc16.落盘",
      "position": {
        "x": 600,
        "y": 5240
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    },
    {
      "id": "308",
      "key": "protocol-slice",
      "label": "复杂协议v3.crc16重算源",
      "position": {
        "x": 900,
        "y": 5240
      },
      "data": {
        "start": 0,
        "length": 79
      }
    },
    {
      "id": "309",
      "key": "protocol-crc",
      "label": "复杂协议v3.crc16重算",
      "position": {
        "x": 1200,
        "y": 5240
      },
      "data": {
        "algorithm": "CRC16",
        "endian": "小端",
        "append": "否"
      }
    },
    {
      "id": "310",
      "key": "transform-byteorder",
      "label": "复杂协议v3.crc16字节序转换",
      "position": {
        "x": 1500,
        "y": 5240
      },
      "data": {
        "type": "小端→大端",
        "size": "2字节"
      }
    },
    {
      "id": "311",
      "key": "compare-eq",
      "label": "复杂协议v3.crc16校验",
      "position": {
        "x": 1800,
        "y": 5240
      },
      "data": {}
    },
    {
      "id": "312",
      "key": "string-template",
      "label": "复杂协议v3.日志.crc16校验",
      "position": {
        "x": 2100,
        "y": 5240
      },
      "data": {
        "template": "${new Date().toLocaleString(\"zh-CN\",{hour12:false})}.${(new Date().getMilliseconds()+\"\").padStart(3,\"0\")} [复杂协议v3.crc16通过?] {1}\n"
      }
    },
    {
      "id": "313",
      "key": "output-file",
      "label": "复杂协议v3.日志.crc16校验.落盘",
      "position": {
        "x": 2400,
        "y": 5240
      },
      "data": {
        "path": "script-logs/复杂协议v3.log",
        "mode": "追加"
      }
    }
  ],
  "connections": [
    {
      "source": "7",
      "sourceOutput": "out",
      "target": "10",
      "targetInput": "field_f0"
    },
    {
      "source": "8",
      "sourceOutput": "out",
      "target": "10",
      "targetInput": "field_f1"
    },
    {
      "source": "9",
      "sourceOutput": "out",
      "target": "10",
      "targetInput": "field_f2"
    },
    {
      "source": "20",
      "sourceOutput": "out",
      "target": "21",
      "targetInput": "body"
    },
    {
      "source": "19",
      "sourceOutput": "out",
      "target": "22",
      "targetInput": "a"
    },
    {
      "source": "21",
      "sourceOutput": "out",
      "target": "22",
      "targetInput": "b"
    },
    {
      "source": "24",
      "sourceOutput": "out",
      "target": "25",
      "targetInput": "body"
    },
    {
      "source": "23",
      "sourceOutput": "out",
      "target": "26",
      "targetInput": "a"
    },
    {
      "source": "25",
      "sourceOutput": "out",
      "target": "26",
      "targetInput": "b"
    },
    {
      "source": "28",
      "sourceOutput": "out",
      "target": "29",
      "targetInput": "body"
    },
    {
      "source": "27",
      "sourceOutput": "out",
      "target": "30",
      "targetInput": "a"
    },
    {
      "source": "29",
      "sourceOutput": "out",
      "target": "30",
      "targetInput": "b"
    },
    {
      "source": "22",
      "sourceOutput": "out",
      "target": "31",
      "targetInput": "a"
    },
    {
      "source": "26",
      "sourceOutput": "out",
      "target": "31",
      "targetInput": "b"
    },
    {
      "source": "30",
      "sourceOutput": "out",
      "target": "31",
      "targetInput": "c"
    },
    {
      "source": "32",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "a"
    },
    {
      "source": "33",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "b"
    },
    {
      "source": "34",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "c"
    },
    {
      "source": "35",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "d"
    },
    {
      "source": "36",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "e"
    },
    {
      "source": "37",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "f"
    },
    {
      "source": "38",
      "sourceOutput": "out",
      "target": "39",
      "targetInput": "g"
    },
    {
      "source": "2",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "a"
    },
    {
      "source": "3",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "b"
    },
    {
      "source": "4",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "c"
    },
    {
      "source": "5",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "d"
    },
    {
      "source": "6",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "e"
    },
    {
      "source": "10",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "f"
    },
    {
      "source": "11",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "g"
    },
    {
      "source": "12",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "h"
    },
    {
      "source": "13",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "i"
    },
    {
      "source": "14",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "j"
    },
    {
      "source": "15",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "k"
    },
    {
      "source": "16",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "l"
    },
    {
      "source": "17",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "m"
    },
    {
      "source": "18",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "n"
    },
    {
      "source": "31",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "o"
    },
    {
      "source": "39",
      "sourceOutput": "out",
      "target": "40",
      "targetInput": "p"
    },
    {
      "source": "40",
      "sourceOutput": "out",
      "target": "41",
      "targetInput": "body"
    },
    {
      "source": "41",
      "sourceOutput": "out",
      "target": "42",
      "targetInput": "body"
    },
    {
      "source": "48",
      "sourceOutput": "out",
      "target": "51",
      "targetInput": "field_f0"
    },
    {
      "source": "49",
      "sourceOutput": "out",
      "target": "51",
      "targetInput": "field_f1"
    },
    {
      "source": "50",
      "sourceOutput": "out",
      "target": "51",
      "targetInput": "field_f2"
    },
    {
      "source": "61",
      "sourceOutput": "out",
      "target": "62",
      "targetInput": "body"
    },
    {
      "source": "60",
      "sourceOutput": "out",
      "target": "63",
      "targetInput": "a"
    },
    {
      "source": "62",
      "sourceOutput": "out",
      "target": "63",
      "targetInput": "b"
    },
    {
      "source": "65",
      "sourceOutput": "out",
      "target": "66",
      "targetInput": "body"
    },
    {
      "source": "64",
      "sourceOutput": "out",
      "target": "67",
      "targetInput": "a"
    },
    {
      "source": "66",
      "sourceOutput": "out",
      "target": "67",
      "targetInput": "b"
    },
    {
      "source": "69",
      "sourceOutput": "out",
      "target": "70",
      "targetInput": "body"
    },
    {
      "source": "68",
      "sourceOutput": "out",
      "target": "71",
      "targetInput": "a"
    },
    {
      "source": "70",
      "sourceOutput": "out",
      "target": "71",
      "targetInput": "b"
    },
    {
      "source": "63",
      "sourceOutput": "out",
      "target": "72",
      "targetInput": "a"
    },
    {
      "source": "67",
      "sourceOutput": "out",
      "target": "72",
      "targetInput": "b"
    },
    {
      "source": "71",
      "sourceOutput": "out",
      "target": "72",
      "targetInput": "c"
    },
    {
      "source": "73",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "a"
    },
    {
      "source": "74",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "b"
    },
    {
      "source": "75",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "c"
    },
    {
      "source": "76",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "d"
    },
    {
      "source": "77",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "e"
    },
    {
      "source": "78",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "f"
    },
    {
      "source": "79",
      "sourceOutput": "out",
      "target": "80",
      "targetInput": "g"
    },
    {
      "source": "43",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "a"
    },
    {
      "source": "44",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "b"
    },
    {
      "source": "45",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "c"
    },
    {
      "source": "46",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "d"
    },
    {
      "source": "47",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "e"
    },
    {
      "source": "51",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "f"
    },
    {
      "source": "52",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "g"
    },
    {
      "source": "53",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "h"
    },
    {
      "source": "54",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "i"
    },
    {
      "source": "55",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "j"
    },
    {
      "source": "56",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "k"
    },
    {
      "source": "57",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "l"
    },
    {
      "source": "58",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "m"
    },
    {
      "source": "59",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "n"
    },
    {
      "source": "72",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "o"
    },
    {
      "source": "80",
      "sourceOutput": "out",
      "target": "81",
      "targetInput": "p"
    },
    {
      "source": "81",
      "sourceOutput": "out",
      "target": "82",
      "targetInput": "body"
    },
    {
      "source": "82",
      "sourceOutput": "out",
      "target": "83",
      "targetInput": "body"
    },
    {
      "source": "89",
      "sourceOutput": "out",
      "target": "92",
      "targetInput": "field_f0"
    },
    {
      "source": "90",
      "sourceOutput": "out",
      "target": "92",
      "targetInput": "field_f1"
    },
    {
      "source": "91",
      "sourceOutput": "out",
      "target": "92",
      "targetInput": "field_f2"
    },
    {
      "source": "102",
      "sourceOutput": "out",
      "target": "103",
      "targetInput": "body"
    },
    {
      "source": "101",
      "sourceOutput": "out",
      "target": "104",
      "targetInput": "a"
    },
    {
      "source": "103",
      "sourceOutput": "out",
      "target": "104",
      "targetInput": "b"
    },
    {
      "source": "106",
      "sourceOutput": "out",
      "target": "107",
      "targetInput": "body"
    },
    {
      "source": "105",
      "sourceOutput": "out",
      "target": "108",
      "targetInput": "a"
    },
    {
      "source": "107",
      "sourceOutput": "out",
      "target": "108",
      "targetInput": "b"
    },
    {
      "source": "110",
      "sourceOutput": "out",
      "target": "111",
      "targetInput": "body"
    },
    {
      "source": "109",
      "sourceOutput": "out",
      "target": "112",
      "targetInput": "a"
    },
    {
      "source": "111",
      "sourceOutput": "out",
      "target": "112",
      "targetInput": "b"
    },
    {
      "source": "104",
      "sourceOutput": "out",
      "target": "113",
      "targetInput": "a"
    },
    {
      "source": "108",
      "sourceOutput": "out",
      "target": "113",
      "targetInput": "b"
    },
    {
      "source": "112",
      "sourceOutput": "out",
      "target": "113",
      "targetInput": "c"
    },
    {
      "source": "114",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "a"
    },
    {
      "source": "115",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "b"
    },
    {
      "source": "116",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "c"
    },
    {
      "source": "117",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "d"
    },
    {
      "source": "118",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "e"
    },
    {
      "source": "119",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "f"
    },
    {
      "source": "120",
      "sourceOutput": "out",
      "target": "121",
      "targetInput": "g"
    },
    {
      "source": "84",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "a"
    },
    {
      "source": "85",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "b"
    },
    {
      "source": "86",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "c"
    },
    {
      "source": "87",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "d"
    },
    {
      "source": "88",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "e"
    },
    {
      "source": "92",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "f"
    },
    {
      "source": "93",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "g"
    },
    {
      "source": "94",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "h"
    },
    {
      "source": "95",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "i"
    },
    {
      "source": "96",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "j"
    },
    {
      "source": "97",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "k"
    },
    {
      "source": "98",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "l"
    },
    {
      "source": "99",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "m"
    },
    {
      "source": "100",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "n"
    },
    {
      "source": "113",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "o"
    },
    {
      "source": "121",
      "sourceOutput": "out",
      "target": "122",
      "targetInput": "p"
    },
    {
      "source": "122",
      "sourceOutput": "out",
      "target": "123",
      "targetInput": "body"
    },
    {
      "source": "123",
      "sourceOutput": "out",
      "target": "124",
      "targetInput": "body"
    },
    {
      "source": "130",
      "sourceOutput": "out",
      "target": "133",
      "targetInput": "field_f0"
    },
    {
      "source": "131",
      "sourceOutput": "out",
      "target": "133",
      "targetInput": "field_f1"
    },
    {
      "source": "132",
      "sourceOutput": "out",
      "target": "133",
      "targetInput": "field_f2"
    },
    {
      "source": "143",
      "sourceOutput": "out",
      "target": "144",
      "targetInput": "body"
    },
    {
      "source": "142",
      "sourceOutput": "out",
      "target": "145",
      "targetInput": "a"
    },
    {
      "source": "144",
      "sourceOutput": "out",
      "target": "145",
      "targetInput": "b"
    },
    {
      "source": "147",
      "sourceOutput": "out",
      "target": "148",
      "targetInput": "body"
    },
    {
      "source": "146",
      "sourceOutput": "out",
      "target": "149",
      "targetInput": "a"
    },
    {
      "source": "148",
      "sourceOutput": "out",
      "target": "149",
      "targetInput": "b"
    },
    {
      "source": "151",
      "sourceOutput": "out",
      "target": "152",
      "targetInput": "body"
    },
    {
      "source": "150",
      "sourceOutput": "out",
      "target": "153",
      "targetInput": "a"
    },
    {
      "source": "152",
      "sourceOutput": "out",
      "target": "153",
      "targetInput": "b"
    },
    {
      "source": "145",
      "sourceOutput": "out",
      "target": "154",
      "targetInput": "a"
    },
    {
      "source": "149",
      "sourceOutput": "out",
      "target": "154",
      "targetInput": "b"
    },
    {
      "source": "153",
      "sourceOutput": "out",
      "target": "154",
      "targetInput": "c"
    },
    {
      "source": "155",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "a"
    },
    {
      "source": "156",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "b"
    },
    {
      "source": "157",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "c"
    },
    {
      "source": "158",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "d"
    },
    {
      "source": "159",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "e"
    },
    {
      "source": "160",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "f"
    },
    {
      "source": "161",
      "sourceOutput": "out",
      "target": "162",
      "targetInput": "g"
    },
    {
      "source": "125",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "a"
    },
    {
      "source": "126",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "b"
    },
    {
      "source": "127",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "c"
    },
    {
      "source": "128",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "d"
    },
    {
      "source": "129",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "e"
    },
    {
      "source": "133",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "f"
    },
    {
      "source": "134",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "g"
    },
    {
      "source": "135",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "h"
    },
    {
      "source": "136",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "i"
    },
    {
      "source": "137",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "j"
    },
    {
      "source": "138",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "k"
    },
    {
      "source": "139",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "l"
    },
    {
      "source": "140",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "m"
    },
    {
      "source": "141",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "n"
    },
    {
      "source": "154",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "o"
    },
    {
      "source": "162",
      "sourceOutput": "out",
      "target": "163",
      "targetInput": "p"
    },
    {
      "source": "163",
      "sourceOutput": "out",
      "target": "164",
      "targetInput": "body"
    },
    {
      "source": "164",
      "sourceOutput": "out",
      "target": "165",
      "targetInput": "body"
    },
    {
      "source": "1",
      "sourceOutput": "out",
      "target": "5",
      "targetInput": "content"
    },
    {
      "source": "1",
      "sourceOutput": "out",
      "target": "46",
      "targetInput": "content"
    },
    {
      "source": "1",
      "sourceOutput": "out",
      "target": "87",
      "targetInput": "content"
    },
    {
      "source": "1",
      "sourceOutput": "out",
      "target": "128",
      "targetInput": "content"
    },
    {
      "source": "1",
      "sourceOutput": "out",
      "target": "166",
      "targetInput": "left"
    },
    {
      "source": "166",
      "sourceOutput": "out",
      "target": "167",
      "targetInput": "left"
    },
    {
      "source": "167",
      "sourceOutput": "result",
      "target": "168",
      "targetInput": "condition"
    },
    {
      "source": "169",
      "sourceOutput": "out",
      "target": "170",
      "targetInput": "in"
    },
    {
      "source": "168",
      "sourceOutput": "true",
      "target": "170",
      "targetInput": "trigger"
    },
    {
      "source": "42",
      "sourceOutput": "out",
      "target": "172",
      "targetInput": "in"
    },
    {
      "source": "171",
      "sourceOutput": "out",
      "target": "172",
      "targetInput": "port"
    },
    {
      "source": "83",
      "sourceOutput": "out",
      "target": "173",
      "targetInput": "in"
    },
    {
      "source": "171",
      "sourceOutput": "out",
      "target": "173",
      "targetInput": "port"
    },
    {
      "source": "124",
      "sourceOutput": "out",
      "target": "174",
      "targetInput": "in"
    },
    {
      "source": "171",
      "sourceOutput": "out",
      "target": "174",
      "targetInput": "port"
    },
    {
      "source": "165",
      "sourceOutput": "out",
      "target": "175",
      "targetInput": "in"
    },
    {
      "source": "171",
      "sourceOutput": "out",
      "target": "175",
      "targetInput": "port"
    },
    {
      "source": "171",
      "sourceOutput": "out",
      "target": "177",
      "targetInput": "port"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "178",
      "targetInput": "hex"
    },
    {
      "source": "178",
      "sourceOutput": "out",
      "target": "179",
      "targetInput": "hex"
    },
    {
      "source": "179",
      "sourceOutput": "out",
      "target": "180",
      "targetInput": "value1"
    },
    {
      "source": "180",
      "sourceOutput": "out",
      "target": "181",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "182",
      "targetInput": "hex"
    },
    {
      "source": "182",
      "sourceOutput": "out",
      "target": "183",
      "targetInput": "hex"
    },
    {
      "source": "183",
      "sourceOutput": "out",
      "target": "184",
      "targetInput": "value1"
    },
    {
      "source": "184",
      "sourceOutput": "out",
      "target": "185",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "186",
      "targetInput": "hex"
    },
    {
      "source": "183",
      "sourceOutput": "out",
      "target": "186",
      "targetInput": "length"
    },
    {
      "source": "186",
      "sourceOutput": "out",
      "target": "187",
      "targetInput": "value1"
    },
    {
      "source": "187",
      "sourceOutput": "out",
      "target": "188",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "189",
      "targetInput": "hex"
    },
    {
      "source": "189",
      "sourceOutput": "out",
      "target": "190",
      "targetInput": "value1"
    },
    {
      "source": "190",
      "sourceOutput": "out",
      "target": "191",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "192",
      "targetInput": "hex"
    },
    {
      "source": "192",
      "sourceOutput": "out",
      "target": "193",
      "targetInput": "value1"
    },
    {
      "source": "193",
      "sourceOutput": "out",
      "target": "194",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "195",
      "targetInput": "hex"
    },
    {
      "source": "195",
      "sourceOutput": "out",
      "target": "196",
      "targetInput": "hex"
    },
    {
      "source": "196",
      "sourceOutput": "out",
      "target": "197",
      "targetInput": "value1"
    },
    {
      "source": "197",
      "sourceOutput": "out",
      "target": "198",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "199",
      "targetInput": "hex"
    },
    {
      "source": "199",
      "sourceOutput": "out",
      "target": "200",
      "targetInput": "hex"
    },
    {
      "source": "200",
      "sourceOutput": "out",
      "target": "201",
      "targetInput": "value1"
    },
    {
      "source": "201",
      "sourceOutput": "out",
      "target": "202",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "203",
      "targetInput": "hex"
    },
    {
      "source": "203",
      "sourceOutput": "out",
      "target": "204",
      "targetInput": "value1"
    },
    {
      "source": "204",
      "sourceOutput": "out",
      "target": "205",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "206",
      "targetInput": "hex"
    },
    {
      "source": "206",
      "sourceOutput": "out",
      "target": "207",
      "targetInput": "hex"
    },
    {
      "source": "207",
      "sourceOutput": "field_f0",
      "target": "208",
      "targetInput": "value1"
    },
    {
      "source": "208",
      "sourceOutput": "out",
      "target": "209",
      "targetInput": "in"
    },
    {
      "source": "207",
      "sourceOutput": "field_f1",
      "target": "210",
      "targetInput": "value1"
    },
    {
      "source": "210",
      "sourceOutput": "out",
      "target": "211",
      "targetInput": "in"
    },
    {
      "source": "207",
      "sourceOutput": "field_f2",
      "target": "212",
      "targetInput": "value1"
    },
    {
      "source": "212",
      "sourceOutput": "out",
      "target": "213",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "214",
      "targetInput": "hex"
    },
    {
      "source": "214",
      "sourceOutput": "out",
      "target": "215",
      "targetInput": "hex"
    },
    {
      "source": "215",
      "sourceOutput": "out",
      "target": "216",
      "targetInput": "value1"
    },
    {
      "source": "216",
      "sourceOutput": "out",
      "target": "217",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "218",
      "targetInput": "hex"
    },
    {
      "source": "218",
      "sourceOutput": "out",
      "target": "219",
      "targetInput": "hex"
    },
    {
      "source": "219",
      "sourceOutput": "out",
      "target": "220",
      "targetInput": "value1"
    },
    {
      "source": "220",
      "sourceOutput": "out",
      "target": "221",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "222",
      "targetInput": "hex"
    },
    {
      "source": "222",
      "sourceOutput": "out",
      "target": "223",
      "targetInput": "hex"
    },
    {
      "source": "223",
      "sourceOutput": "out",
      "target": "224",
      "targetInput": "value1"
    },
    {
      "source": "224",
      "sourceOutput": "out",
      "target": "225",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "226",
      "targetInput": "hex"
    },
    {
      "source": "226",
      "sourceOutput": "out",
      "target": "227",
      "targetInput": "hex"
    },
    {
      "source": "227",
      "sourceOutput": "out",
      "target": "228",
      "targetInput": "value1"
    },
    {
      "source": "228",
      "sourceOutput": "out",
      "target": "229",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "230",
      "targetInput": "hex"
    },
    {
      "source": "230",
      "sourceOutput": "out",
      "target": "231",
      "targetInput": "hex"
    },
    {
      "source": "231",
      "sourceOutput": "out",
      "target": "232",
      "targetInput": "value1"
    },
    {
      "source": "232",
      "sourceOutput": "out",
      "target": "233",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "234",
      "targetInput": "hex"
    },
    {
      "source": "231",
      "sourceOutput": "out",
      "target": "234",
      "targetInput": "length"
    },
    {
      "source": "234",
      "sourceOutput": "out",
      "target": "235",
      "targetInput": "value1"
    },
    {
      "source": "235",
      "sourceOutput": "out",
      "target": "236",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "237",
      "targetInput": "hex"
    },
    {
      "source": "237",
      "sourceOutput": "out",
      "target": "238",
      "targetInput": "hex"
    },
    {
      "source": "238",
      "sourceOutput": "out",
      "target": "239",
      "targetInput": "value1"
    },
    {
      "source": "239",
      "sourceOutput": "out",
      "target": "240",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "241",
      "targetInput": "hex"
    },
    {
      "source": "241",
      "sourceOutput": "out",
      "target": "242",
      "targetInput": "hex"
    },
    {
      "source": "242",
      "sourceOutput": "out",
      "target": "243",
      "targetInput": "value1"
    },
    {
      "source": "243",
      "sourceOutput": "out",
      "target": "244",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "245",
      "targetInput": "hex"
    },
    {
      "source": "242",
      "sourceOutput": "out",
      "target": "245",
      "targetInput": "length"
    },
    {
      "source": "245",
      "sourceOutput": "out",
      "target": "246",
      "targetInput": "value1"
    },
    {
      "source": "246",
      "sourceOutput": "out",
      "target": "247",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "248",
      "targetInput": "hex"
    },
    {
      "source": "248",
      "sourceOutput": "out",
      "target": "249",
      "targetInput": "hex"
    },
    {
      "source": "249",
      "sourceOutput": "out",
      "target": "250",
      "targetInput": "value1"
    },
    {
      "source": "250",
      "sourceOutput": "out",
      "target": "251",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "252",
      "targetInput": "hex"
    },
    {
      "source": "252",
      "sourceOutput": "out",
      "target": "253",
      "targetInput": "hex"
    },
    {
      "source": "253",
      "sourceOutput": "out",
      "target": "254",
      "targetInput": "value1"
    },
    {
      "source": "254",
      "sourceOutput": "out",
      "target": "255",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "256",
      "targetInput": "hex"
    },
    {
      "source": "253",
      "sourceOutput": "out",
      "target": "256",
      "targetInput": "length"
    },
    {
      "source": "256",
      "sourceOutput": "out",
      "target": "257",
      "targetInput": "value1"
    },
    {
      "source": "257",
      "sourceOutput": "out",
      "target": "258",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "259",
      "targetInput": "hex"
    },
    {
      "source": "259",
      "sourceOutput": "out",
      "target": "260",
      "targetInput": "hex"
    },
    {
      "source": "260",
      "sourceOutput": "out",
      "target": "261",
      "targetInput": "value1"
    },
    {
      "source": "261",
      "sourceOutput": "out",
      "target": "262",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "263",
      "targetInput": "hex"
    },
    {
      "source": "263",
      "sourceOutput": "out",
      "target": "264",
      "targetInput": "value1"
    },
    {
      "source": "264",
      "sourceOutput": "out",
      "target": "265",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "266",
      "targetInput": "hex"
    },
    {
      "source": "266",
      "sourceOutput": "out",
      "target": "267",
      "targetInput": "value1"
    },
    {
      "source": "267",
      "sourceOutput": "out",
      "target": "268",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "269",
      "targetInput": "hex"
    },
    {
      "source": "269",
      "sourceOutput": "out",
      "target": "270",
      "targetInput": "value1"
    },
    {
      "source": "270",
      "sourceOutput": "out",
      "target": "271",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "272",
      "targetInput": "hex"
    },
    {
      "source": "272",
      "sourceOutput": "out",
      "target": "273",
      "targetInput": "value1"
    },
    {
      "source": "273",
      "sourceOutput": "out",
      "target": "274",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "275",
      "targetInput": "hex"
    },
    {
      "source": "275",
      "sourceOutput": "out",
      "target": "276",
      "targetInput": "value1"
    },
    {
      "source": "276",
      "sourceOutput": "out",
      "target": "277",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "278",
      "targetInput": "hex"
    },
    {
      "source": "278",
      "sourceOutput": "out",
      "target": "279",
      "targetInput": "value1"
    },
    {
      "source": "279",
      "sourceOutput": "out",
      "target": "280",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "281",
      "targetInput": "hex"
    },
    {
      "source": "281",
      "sourceOutput": "out",
      "target": "282",
      "targetInput": "hex"
    },
    {
      "source": "282",
      "sourceOutput": "out",
      "target": "283",
      "targetInput": "value1"
    },
    {
      "source": "283",
      "sourceOutput": "out",
      "target": "284",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "285",
      "targetInput": "hex"
    },
    {
      "source": "285",
      "sourceOutput": "out",
      "target": "286",
      "targetInput": "hex"
    },
    {
      "source": "286",
      "sourceOutput": "out",
      "target": "287",
      "targetInput": "value1"
    },
    {
      "source": "287",
      "sourceOutput": "out",
      "target": "288",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "289",
      "targetInput": "hex"
    },
    {
      "source": "289",
      "sourceOutput": "out",
      "target": "290",
      "targetInput": "hex"
    },
    {
      "source": "290",
      "sourceOutput": "out",
      "target": "291",
      "targetInput": "value1"
    },
    {
      "source": "291",
      "sourceOutput": "out",
      "target": "292",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "293",
      "targetInput": "hex"
    },
    {
      "source": "293",
      "sourceOutput": "out",
      "target": "294",
      "targetInput": "hex"
    },
    {
      "source": "294",
      "sourceOutput": "out",
      "target": "295",
      "targetInput": "left"
    },
    {
      "source": "295",
      "sourceOutput": "out",
      "target": "296",
      "targetInput": "left"
    },
    {
      "source": "296",
      "sourceOutput": "result",
      "target": "297",
      "targetInput": "value1"
    },
    {
      "source": "297",
      "sourceOutput": "out",
      "target": "298",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "299",
      "targetInput": "hex"
    },
    {
      "source": "299",
      "sourceOutput": "out",
      "target": "300",
      "targetInput": "value1"
    },
    {
      "source": "300",
      "sourceOutput": "out",
      "target": "301",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "302",
      "targetInput": "hex"
    },
    {
      "source": "302",
      "sourceOutput": "out",
      "target": "303",
      "targetInput": "value1"
    },
    {
      "source": "303",
      "sourceOutput": "out",
      "target": "304",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "305",
      "targetInput": "hex"
    },
    {
      "source": "305",
      "sourceOutput": "out",
      "target": "306",
      "targetInput": "value1"
    },
    {
      "source": "306",
      "sourceOutput": "out",
      "target": "307",
      "targetInput": "in"
    },
    {
      "source": "177",
      "sourceOutput": "out",
      "target": "308",
      "targetInput": "hex"
    },
    {
      "source": "308",
      "sourceOutput": "out",
      "target": "309",
      "targetInput": "body"
    },
    {
      "source": "309",
      "sourceOutput": "out",
      "target": "310",
      "targetInput": "in"
    },
    {
      "source": "310",
      "sourceOutput": "out",
      "target": "311",
      "targetInput": "left"
    },
    {
      "source": "305",
      "sourceOutput": "out",
      "target": "311",
      "targetInput": "right"
    },
    {
      "source": "311",
      "sourceOutput": "result",
      "target": "312",
      "targetInput": "value1"
    },
    {
      "source": "312",
      "sourceOutput": "out",
      "target": "313",
      "targetInput": "in"
    }
  ]
}
VS_FLOW_END */
// Generated code:
try {
  const _listeners = [];
  if (await checkStop()) return;
  var _out_2 = "AA55";
  if (await checkStop()) return;
  var _out_3 = "03";
  if (await checkStop()) return;
  var _out_4 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_5 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_6 = "FF";
  if (await checkStop()) return;
  var _out_11 = (() => { var _n = Number("17"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_12 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_13 = textToHex(convertEncoding("STATION-A", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_14 = (() => { var _n = Number("257"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_15 = (() => { var _n = Number("258"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_16 = (() => { var _n = Number("259"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_17 = (() => { var _n = Number("270545216"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 8) _h = '0' + _h; return _h.slice(-8); })();
  // [节点 custom-aes-crypto 未注册，已跳过（组件可能已被删除）]
  if (await checkStop()) return;
  var _out_19 = "10";
  if (await checkStop()) return;
  var _out_20 = "AABBCC";
  if (await checkStop()) return;
  var _out_21 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_20||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_22 = (String(_out_19||'') + String(_out_21||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_23 = "11";
  if (await checkStop()) return;
  var _out_24 = textToHex(convertEncoding("HELLO", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_25 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_24||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_26 = (String(_out_23||'') + String(_out_25||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_27 = "12";
  if (await checkStop()) return;
  var _out_28 = "0102030405";
  if (await checkStop()) return;
  var _out_29 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_28||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_30 = (String(_out_27||'') + String(_out_29||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_31 = (String(_out_22||'') + String(_out_26||'') + String(_out_30||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_32 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_33 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_34 = (() => { var _n = Number("101"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_35 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_36 = (() => { var _n = Number("101"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_37 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_38 = (() => { var _n = Number("101"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_39 = (String(_out_32||'') + String(_out_33||'') + String(_out_34||'') + String(_out_35||'') + String(_out_36||'') + String(_out_37||'') + String(_out_38||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_43 = "AA55";
  if (await checkStop()) return;
  var _out_44 = "03";
  if (await checkStop()) return;
  var _out_45 = (() => { var _n = Number("2"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_46 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_47 = "FF";
  if (await checkStop()) return;
  var _out_52 = (() => { var _n = Number("18"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_53 = (() => { var _n = Number("2"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_54 = textToHex(convertEncoding("STATION-B", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_55 = (() => { var _n = Number("513"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_56 = (() => { var _n = Number("514"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_57 = (() => { var _n = Number("515"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_58 = (() => { var _n = Number("270545472"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 8) _h = '0' + _h; return _h.slice(-8); })();
  // [节点 custom-aes-crypto 未注册，已跳过（组件可能已被删除）]
  if (await checkStop()) return;
  var _out_60 = "10";
  if (await checkStop()) return;
  var _out_61 = "AABBCC";
  if (await checkStop()) return;
  var _out_62 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_61||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_63 = (String(_out_60||'') + String(_out_62||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_64 = "11";
  if (await checkStop()) return;
  var _out_65 = textToHex(convertEncoding("HELLO", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_66 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_65||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_67 = (String(_out_64||'') + String(_out_66||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_68 = "12";
  if (await checkStop()) return;
  var _out_69 = "0102030405";
  if (await checkStop()) return;
  var _out_70 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_69||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_71 = (String(_out_68||'') + String(_out_70||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_72 = (String(_out_63||'') + String(_out_67||'') + String(_out_71||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_73 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_74 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_75 = (() => { var _n = Number("102"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_76 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_77 = (() => { var _n = Number("102"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_78 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_79 = (() => { var _n = Number("102"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_80 = (String(_out_73||'') + String(_out_74||'') + String(_out_75||'') + String(_out_76||'') + String(_out_77||'') + String(_out_78||'') + String(_out_79||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_84 = "AA55";
  if (await checkStop()) return;
  var _out_85 = "03";
  if (await checkStop()) return;
  var _out_86 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_87 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_88 = "FF";
  if (await checkStop()) return;
  var _out_93 = (() => { var _n = Number("19"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_94 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_95 = textToHex(convertEncoding("STATION-C", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_96 = (() => { var _n = Number("769"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_97 = (() => { var _n = Number("770"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_98 = (() => { var _n = Number("771"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_99 = (() => { var _n = Number("270545728"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 8) _h = '0' + _h; return _h.slice(-8); })();
  // [节点 custom-aes-crypto 未注册，已跳过（组件可能已被删除）]
  if (await checkStop()) return;
  var _out_101 = "10";
  if (await checkStop()) return;
  var _out_102 = "AABBCC";
  if (await checkStop()) return;
  var _out_103 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_102||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_104 = (String(_out_101||'') + String(_out_103||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_105 = "11";
  if (await checkStop()) return;
  var _out_106 = textToHex(convertEncoding("HELLO", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_107 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_106||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_108 = (String(_out_105||'') + String(_out_107||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_109 = "12";
  if (await checkStop()) return;
  var _out_110 = "0102030405";
  if (await checkStop()) return;
  var _out_111 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_110||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_112 = (String(_out_109||'') + String(_out_111||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_113 = (String(_out_104||'') + String(_out_108||'') + String(_out_112||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_114 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_115 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_116 = (() => { var _n = Number("103"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_117 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_118 = (() => { var _n = Number("103"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_119 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_120 = (() => { var _n = Number("103"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_121 = (String(_out_114||'') + String(_out_115||'') + String(_out_116||'') + String(_out_117||'') + String(_out_118||'') + String(_out_119||'') + String(_out_120||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_125 = "AA55";
  if (await checkStop()) return;
  var _out_126 = "03";
  if (await checkStop()) return;
  var _out_127 = (() => { var _n = Number("4"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_128 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_129 = "FF";
  if (await checkStop()) return;
  var _out_134 = (() => { var _n = Number("20"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_135 = (() => { var _n = Number("4"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_136 = textToHex(convertEncoding("STATION-D", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_137 = (() => { var _n = Number("1025"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_138 = (() => { var _n = Number("1026"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_139 = (() => { var _n = Number("1027"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_140 = (() => { var _n = Number("270545984"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 8) _h = '0' + _h; return _h.slice(-8); })();
  // [节点 custom-aes-crypto 未注册，已跳过（组件可能已被删除）]
  if (await checkStop()) return;
  var _out_142 = "10";
  if (await checkStop()) return;
  var _out_143 = "AABBCC";
  if (await checkStop()) return;
  var _out_144 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_143||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_145 = (String(_out_142||'') + String(_out_144||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_146 = "11";
  if (await checkStop()) return;
  var _out_147 = textToHex(convertEncoding("HELLO", 'utf8', 'latin1')).toUpperCase();
  if (await checkStop()) return;
  var _out_148 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_147||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_149 = (String(_out_146||'') + String(_out_148||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_150 = "12";
  if (await checkStop()) return;
  var _out_151 = "0102030405";
  if (await checkStop()) return;
  var _out_152 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_151||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 2).toUpperCase();
  return lenHex + body;
})();
  if (await checkStop()) return;
  var _out_153 = (String(_out_150||'') + String(_out_152||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_154 = (String(_out_145||'') + String(_out_149||'') + String(_out_153||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_155 = (() => { var _n = Number("3"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_156 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_157 = (() => { var _n = Number("104"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_158 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_159 = (() => { var _n = Number("104"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_160 = (() => { var _n = Number("1"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 2) _h = '0' + _h; return _h.slice(-2); })();
  if (await checkStop()) return;
  var _out_161 = (() => { var _n = Number("104"); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
  if (await checkStop()) return;
  var _out_162 = (String(_out_155||'') + String(_out_156||'') + String(_out_157||'') + String(_out_158||'') + String(_out_159||'') + String(_out_160||'') + String(_out_161||'')).toUpperCase().replace(/\s/g,'');
  if (await checkStop()) return;
  var _out_166 = _out_1 % 100;
  if (await checkStop()) return;
  var _out_167 = _out_166 == 0;
  _listeners.push(listenTcpPackets("127.0.0.1", 39189)(async (_out_177) => {
    if (await checkStop()) return;
    if (await checkStop()) return;
    var _out_178 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(5) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_179 = (() => {
  var h = (() => { var _s = String(_out_178||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_180 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.msgType] ${_out_179}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_180, "append");
    if (await checkStop()) return;
    var _out_182 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(0) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_183 = (() => {
  var h = (() => { var _s = String(_out_182||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_184 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.len] ${_out_183}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_184, "append");
    if (await checkStop()) return;
    var _out_186 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(2) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_183) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_187 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.body] ${_out_186}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_187, "append");
    if (await checkStop()) return;
    var _out_186 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(2) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_183) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_187 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.body] ${_out_186}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_187, "append");
    if (await checkStop()) return;
    var _out_189 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(2) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_190 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.magic] ${_out_189}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_190, "append");
    if (await checkStop()) return;
    var _out_192 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(4) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_193 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.version] ${_out_192}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_193, "append");
    if (await checkStop()) return;
    var _out_195 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(5) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_196 = (() => {
  var h = (() => { var _s = String(_out_195||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_197 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.msgType] ${_out_196}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_197, "append");
    if (await checkStop()) return;
    var _out_199 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(6) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_200 = (() => {
  var h = (() => { var _s = String(_out_199||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_201 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.seq] ${_out_200}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_201, "append");
    if (await checkStop()) return;
    var _out_203 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(8) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_204 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.flags] ${_out_203}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_204, "append");
    if (await checkStop()) return;
    var _out_206 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(9) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _bin__out_207 = (function(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); })(convertBase((() => { var _s = String(_out_206||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })(), '十六进制', '二进制'), 16);
    var _out_207_f0 = Number(convertBase(_bin__out_207.slice(0, 4), '二进制', '十进制'));
    var _out_207_f1 = Number(convertBase(_bin__out_207.slice(4, 8), '二进制', '十进制'));
    var _out_207_f2 = Number(convertBase(_bin__out_207.slice(8, 16), '二进制', '十进制'));
    var _out_207 = _out_207_f0;
    if (await checkStop()) return;
    var _out_208 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.控制字.优先级] ${_out_207_f0}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_208, "append");
    if (await checkStop()) return;
    var _out_210 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.控制字.重试] ${_out_207_f1}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_210, "append");
    if (await checkStop()) return;
    var _out_212 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.控制字.告警] ${_out_207_f2}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_212, "append");
    if (await checkStop()) return;
    var _out_214 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(11) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_215 = (() => {
  var h = (() => { var _s = String(_out_214||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_216 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.命令码] ${_out_215}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_216, "append");
    if (await checkStop()) return;
    var _out_218 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(13) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_219 = (() => {
  var h = (() => { var _s = String(_out_218||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_220 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.目标ID] ${_out_219}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_220, "append");
    if (await checkStop()) return;
    var _out_222 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(15) || 0) * 2;
  var _l = Math.max(0, parseInt(9) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_223 = convertEncoding(hexToText((() => { var _s = String(_out_222||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })()), 'latin1', 'utf8');
    if (await checkStop()) return;
    var _out_224 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.设备名] ${_out_223}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_224, "append");
    if (await checkStop()) return;
    var _out_226 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(24) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_227 = (() => {
  var h = (() => { var _s = String(_out_226||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_228 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.T10] ${_out_227}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_228, "append");
    if (await checkStop()) return;
    var _out_230 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(25) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_231 = (() => {
  var h = (() => { var _s = String(_out_230||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_232 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.长度] ${_out_231}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_232, "append");
    if (await checkStop()) return;
    var _out_234 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(26) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_231) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_235 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T10] ${_out_234}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_235, "append");
    if (await checkStop()) return;
    var _out_234 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(26) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_231) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_235 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T10] ${_out_234}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_235, "append");
    if (await checkStop()) return;
    var _out_237 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(29) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_238 = (() => {
  var h = (() => { var _s = String(_out_237||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_239 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.T11] ${_out_238}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_239, "append");
    if (await checkStop()) return;
    var _out_241 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(30) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_242 = (() => {
  var h = (() => { var _s = String(_out_241||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_243 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.长度] ${_out_242}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_243, "append");
    if (await checkStop()) return;
    var _out_245 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(31) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_242) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_246 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T11] ${_out_245}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_246, "append");
    if (await checkStop()) return;
    var _out_245 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(31) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_242) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_246 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T11] ${_out_245}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_246, "append");
    if (await checkStop()) return;
    var _out_248 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(36) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_249 = (() => {
  var h = (() => { var _s = String(_out_248||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_250 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.T12] ${_out_249}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_250, "append");
    if (await checkStop()) return;
    var _out_252 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(37) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_253 = (() => {
  var h = (() => { var _s = String(_out_252||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_254 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.长度] ${_out_253}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_254, "append");
    if (await checkStop()) return;
    var _out_256 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(38) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_253) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_257 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T12] ${_out_256}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_257, "append");
    if (await checkStop()) return;
    var _out_256 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(38) || 0) * 2;
  var _l = Math.max(0, parseInt(_out_253) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_257 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.参数区.值T12] ${_out_256}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_257, "append");
    if (await checkStop()) return;
    var _out_259 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(43) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_260 = (() => {
  var h = (() => { var _s = String(_out_259||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_261 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.数量] ${_out_260}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_261, "append");
    if (await checkStop()) return;
    var _out_263 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(44) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_264 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块1.通道号] ${_out_263}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_264, "append");
    if (await checkStop()) return;
    var _out_266 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(45) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_267 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块1.通道值] ${_out_266}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_267, "append");
    if (await checkStop()) return;
    var _out_269 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(47) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_270 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块2.通道号] ${_out_269}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_270, "append");
    if (await checkStop()) return;
    var _out_272 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(48) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_273 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块2.通道值] ${_out_272}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_273, "append");
    if (await checkStop()) return;
    var _out_275 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(50) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_276 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块3.通道号] ${_out_275}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_276, "append");
    if (await checkStop()) return;
    var _out_278 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(51) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_279 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.通道表.块3.通道值] ${_out_278}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_279, "append");
    if (await checkStop()) return;
    var _out_281 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(53) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_282 = (() => {
  var h = (() => { var _s = String(_out_281||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_283 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.传感器1] ${_out_282}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_283, "append");
    if (await checkStop()) return;
    var _out_285 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(55) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_286 = (() => {
  var h = (() => { var _s = String(_out_285||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_287 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.传感器2] ${_out_286}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_287, "append");
    if (await checkStop()) return;
    var _out_289 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(57) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_290 = (() => {
  var h = (() => { var _s = String(_out_289||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 4);
  while (chunk.length < 4) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_291 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.传感器3] ${_out_290}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_291, "append");
    if (await checkStop()) return;
    var _out_293 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(8) || 0) * 2;
  var _l = Math.max(0, parseInt(1) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_294 = (() => {
  var h = (() => { var _s = String(_out_293||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var chunk = h.substr(0, 2);
  while (chunk.length < 2) chunk = '0' + chunk;
  
  return Number(convertBase(chunk, '十六进制', '十进制'));
})();
    if (await checkStop()) return;
    var _out_295 = _out_294 & 1;
    if (await checkStop()) return;
    var _out_296 = _out_295 != 0;
    if (await checkStop()) return;
    var _out_297 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.扩展时间存在] ${_out_296}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_297, "append");
    if (await checkStop()) return;
    var _out_299 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(59) || 0) * 2;
  var _l = Math.max(0, parseInt(4) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_300 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.扩展时间] ${_out_299}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_300, "append");
    if (await checkStop()) return;
    var _out_302 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(63) || 0) * 2;
  var _l = Math.max(0, parseInt(16) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_303 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.载荷加密] ${_out_302}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_303, "append");
    if (await checkStop()) return;
    var _out_305 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(79) || 0) * 2;
  var _l = Math.max(0, parseInt(2) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_306 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.crc16] ${_out_305}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_306, "append");
    if (await checkStop()) return;
    var _out_308 = (() => {
  var _h = (() => { var _s = String(_out_177||''); if (_s.indexOf('[测试')===0||_s.indexOf('[超时')===0) return ''; var _c = _s.replace(/[\s,]/g,''); if (_c.length && _c.length%2===0 && /^[0-9a-f]+$/i.test(_c)) return _c.toUpperCase(); return textToHex(_s).toUpperCase(); })();
  var _s = Math.max(0, parseInt(0) || 0) * 2;
  var _l = Math.max(0, parseInt(79) || 0) * 2;
  return _h.substr(_s, _l);
})();
    if (await checkStop()) return;
    var _out_309 = (() => {
  var body = String(_out_308||'').replace(/\s/g,'').toUpperCase();
  var c = String(crc16(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = c.substr(2,2)+c.substr(0,2);
  return out;
})();
    if (await checkStop()) return;
    var _out_310 = swapBytes(_out_309, 2);
    if (await checkStop()) return;
    var _out_311 = _out_310 == _out_305;
    if (await checkStop()) return;
    var _out_312 = `${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")} [复杂协议v3.crc16通过?] ${_out_311}
`;
    if (await checkStop()) return;
    await writeFile("script-logs/复杂协议v3.log", _out_312, "append");
  }));
  if (await checkStop()) return;
  for (let _i = 0; _i < 1000; _i++) {
    var _out_1 = _i + 1;
    if (await checkStop()) return;
    var _out_5 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
    if (await checkStop()) return;
    var _out_7 = "0";
    if (await checkStop()) return;
    var _out_8 = "0";
    if (await checkStop()) return;
    var _out_9 = "0";
    if (await checkStop()) return;
    var _out_10 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var bin = _pad(convertBase(String(_out_7||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_8||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_9||0), '十进制', '二进制'), 8);
  var d = convertBase(bin || '0', '二进制', '十进制');
  return _pad(convertBase(String(d), '十进制', '十六进制'), 4).toUpperCase();
})();
    if (await checkStop()) return;
    var _out_40 = (String(_out_2||'') + String(_out_3||'') + String(_out_4||'') + String(_out_5||'') + String(_out_6||'') + String(_out_10||'') + String(_out_11||'') + String(_out_12||'') + String(_out_13||'') + String(_out_14||'') + String(_out_15||'') + String(_out_16||'') + String(_out_17||'') + String(_out_18||'') + String(_out_31||'') + String(_out_39||'')).toUpperCase().replace(/\s/g,'');
    if (await checkStop()) return;
    var _out_41 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_40||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 4).toUpperCase();
  return lenHex + body;
})();
    if (await checkStop()) return;
    var _out_42 = (() => {
  var body = String(_out_41||'').replace(/\s/g,'').toUpperCase();
  var c = String(crc16(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = c.substr(2,2)+c.substr(0,2);
  return body + out;
})();
    if (await checkStop()) return;
    var _out_171 = "39189";
    if (await checkStop()) return;
    await sendTCP("127.0.0.1", 39189, _out_42, "hex");
    if (await checkStop()) return;
    var _out_46 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
    if (await checkStop()) return;
    var _out_48 = "0";
    if (await checkStop()) return;
    var _out_49 = "0";
    if (await checkStop()) return;
    var _out_50 = "0";
    if (await checkStop()) return;
    var _out_51 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var bin = _pad(convertBase(String(_out_48||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_49||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_50||0), '十进制', '二进制'), 8);
  var d = convertBase(bin || '0', '二进制', '十进制');
  return _pad(convertBase(String(d), '十进制', '十六进制'), 4).toUpperCase();
})();
    if (await checkStop()) return;
    var _out_81 = (String(_out_43||'') + String(_out_44||'') + String(_out_45||'') + String(_out_46||'') + String(_out_47||'') + String(_out_51||'') + String(_out_52||'') + String(_out_53||'') + String(_out_54||'') + String(_out_55||'') + String(_out_56||'') + String(_out_57||'') + String(_out_58||'') + String(_out_59||'') + String(_out_72||'') + String(_out_80||'')).toUpperCase().replace(/\s/g,'');
    if (await checkStop()) return;
    var _out_82 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_81||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 4).toUpperCase();
  return lenHex + body;
})();
    if (await checkStop()) return;
    var _out_83 = (() => {
  var body = String(_out_82||'').replace(/\s/g,'').toUpperCase();
  var c = String(crc16(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = c.substr(2,2)+c.substr(0,2);
  return body + out;
})();
    if (await checkStop()) return;
    await sendTCP("127.0.0.1", 39189, _out_83, "hex");
    if (await checkStop()) return;
    var _out_87 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
    if (await checkStop()) return;
    var _out_89 = "0";
    if (await checkStop()) return;
    var _out_90 = "0";
    if (await checkStop()) return;
    var _out_91 = "0";
    if (await checkStop()) return;
    var _out_92 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var bin = _pad(convertBase(String(_out_89||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_90||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_91||0), '十进制', '二进制'), 8);
  var d = convertBase(bin || '0', '二进制', '十进制');
  return _pad(convertBase(String(d), '十进制', '十六进制'), 4).toUpperCase();
})();
    if (await checkStop()) return;
    var _out_122 = (String(_out_84||'') + String(_out_85||'') + String(_out_86||'') + String(_out_87||'') + String(_out_88||'') + String(_out_92||'') + String(_out_93||'') + String(_out_94||'') + String(_out_95||'') + String(_out_96||'') + String(_out_97||'') + String(_out_98||'') + String(_out_99||'') + String(_out_100||'') + String(_out_113||'') + String(_out_121||'')).toUpperCase().replace(/\s/g,'');
    if (await checkStop()) return;
    var _out_123 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_122||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 4).toUpperCase();
  return lenHex + body;
})();
    if (await checkStop()) return;
    var _out_124 = (() => {
  var body = String(_out_123||'').replace(/\s/g,'').toUpperCase();
  var c = String(crc16(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = c.substr(2,2)+c.substr(0,2);
  return body + out;
})();
    if (await checkStop()) return;
    await sendTCP("127.0.0.1", 39189, _out_124, "hex");
    if (await checkStop()) return;
    var _out_128 = (() => { var _n = Number(String(_out_1)); var _h = convertBase(String(_n>>>0), '十进制', '十六进制').toUpperCase(); while (_h.length < 4) _h = '0' + _h; return _h.slice(-4); })();
    if (await checkStop()) return;
    var _out_130 = "0";
    if (await checkStop()) return;
    var _out_131 = "0";
    if (await checkStop()) return;
    var _out_132 = "0";
    if (await checkStop()) return;
    var _out_133 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var bin = _pad(convertBase(String(_out_130||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_131||0), '十进制', '二进制'), 4) + _pad(convertBase(String(_out_132||0), '十进制', '二进制'), 8);
  var d = convertBase(bin || '0', '二进制', '十进制');
  return _pad(convertBase(String(d), '十进制', '十六进制'), 4).toUpperCase();
})();
    if (await checkStop()) return;
    var _out_163 = (String(_out_125||'') + String(_out_126||'') + String(_out_127||'') + String(_out_128||'') + String(_out_129||'') + String(_out_133||'') + String(_out_134||'') + String(_out_135||'') + String(_out_136||'') + String(_out_137||'') + String(_out_138||'') + String(_out_139||'') + String(_out_140||'') + String(_out_141||'') + String(_out_154||'') + String(_out_162||'')).toUpperCase().replace(/\s/g,'');
    if (await checkStop()) return;
    var _out_164 = (() => {
  function _pad(s, n) { s = String(s); while (s.length < n) s = '0' + s; return s.slice(-n); }
  var body = String(_out_163||'').replace(/\s/g,'').toUpperCase();
  var bytes = Math.floor(body.length / 2);
  var lenHex = _pad(convertBase(String(bytes), '十进制', '十六进制'), 4).toUpperCase();
  return lenHex + body;
})();
    if (await checkStop()) return;
    var _out_165 = (() => {
  var body = String(_out_164||'').replace(/\s/g,'').toUpperCase();
  var c = String(crc16(body)).toUpperCase();
  while (c.length < 4) c = '0' + c;
  c = c.slice(-4);
  var out = c.substr(2,2)+c.substr(0,2);
  return body + out;
})();
    if (await checkStop()) return;
    await sendTCP("127.0.0.1", 39189, _out_165, "hex");
    if (await checkStop()) return;
    var _out_166 = _out_1 % 100;
    if (await checkStop()) return;
    var _out_167 = _out_166 == 0;
    if (await checkStop()) return;
    if (_out_167) {
      if (await checkStop()) return;
      var _out_169 = "✓";
      if (await checkStop()) return;
      console.log("[复杂协议v3.进度·每100帧] " + _out_169);
    } else {
    }
  }
  if (await checkStop()) return;
  var _out_176 = "端口填写：改「复杂协议v3.端口(改这里)」节点的 content 为本地 TCP 面板端口（当前 39189），所有发送/接收节点自动同步";
  await Promise.all(_listeners);
} catch (e) {
  if (e.message !== 'ABORTED') console.log('Error: ' + e.message);
}
