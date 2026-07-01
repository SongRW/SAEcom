import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const SPLIT_NODES = {
  'split-delimiter': b.def('split-delimiter', 'split', '分隔符拆分', [b.dataIn()], [b.dataOut()], [
    b.selectControl('delimiter', '分隔符', ['逗号', '空格', '换行', '制表符', '自定义'], '逗号'),
    b.textControl('custom', '自定义分隔'),
    b.textControl('index', '提取索引', '全部')
  ]),
  'split-length': b.def('split-length', 'split', '按长度拆分', [b.dataIn()], [b.dataOut()], [
    b.numberControl('length', '每段长度', 2)
  ]),
  'split-regex': b.def('split-regex', 'split', '正则提取', [b.dataIn()], [b.dataOut()], [
    b.textControl('pattern', '正则表达式'),
    b.textControl('flags', '标志', 'g')
  ]),
  'split-substring': b.def('split-substring', 'split', '截取子串', [b.dataIn()], [b.dataOut()], [
    b.numberControl('start', '起始位置', 0),
    b.textControl('end', '结束位置', '末尾')
  ]),
  'split-trimbytes': b.def('split-trimbytes', 'split', '去头尾字节', [b.dataIn()], [b.dataOut()], [
    b.numberControl('head', '去掉头部', 0),
    b.numberControl('tail', '去掉尾部', 0)
  ])
}
