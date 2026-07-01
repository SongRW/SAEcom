import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleRow } from '@/features/settings/ToggleRow'
import { useSettingsStore, type SettingKey } from '@/shared/store/settings'

// 对齐 legacy src/index.html charEncodingSelect 的 8 项；label 走 i18n key
const ENCODINGS = [
  { value: 'utf-8', key: 'settings.serial.encoding.utf8' },
  { value: 'gbk', key: 'settings.serial.encoding.gbk' },
  { value: 'gb18030', key: 'settings.serial.encoding.gb18030' },
  { value: 'big5', key: 'settings.serial.encoding.big5' },
  { value: 'shift_jis', key: 'settings.serial.encoding.shiftJis' },
  { value: 'euc-kr', key: 'settings.serial.encoding.eucKr' },
  { value: 'iso-8859-1', key: 'settings.serial.encoding.iso88591' },
  { value: 'ascii', key: 'settings.serial.encoding.ascii' }
]

/** 串口分区:时间戳 / 回显 / 字符编码 / 接收缓冲。 */
export function SerialSection() {
  const { t } = useTranslation()
  const { rxTimestamp, txTimestamp, echoSend, charEncoding, bufferTime } = useSettingsStore(
    useShallow((s) => ({
      rxTimestamp: s.rxTimestamp,
      txTimestamp: s.txTimestamp,
      echoSend: s.echoSend,
      charEncoding: s.charEncoding,
      bufferTime: s.bufferTime
    }))
  )
  const setField = useSettingsStore((s) => s.setField)
  const toggle = (key: SettingKey) => (v: boolean) => setField(key, v)

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">{t('settings.serial.title')}</h3>
      <p className="text-xs text-muted-foreground mb-2">{t('settings.serial.subtitle')}</p>
      <ToggleRow id="rxTimestamp" label={t('settings.serial.rxTimestamp')} checked={rxTimestamp} onCheckedChange={toggle('rxTimestamp')} />
      <ToggleRow id="txTimestamp" label={t('settings.serial.txTimestamp')} checked={txTimestamp} onCheckedChange={toggle('txTimestamp')} />
      <ToggleRow id="echoSend" label={t('settings.serial.echoSend')} checked={echoSend} onCheckedChange={toggle('echoSend')} />

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="charEncoding" className="text-sm font-normal">
          {t('settings.serial.charEncoding')}
        </Label>
        <Select value={charEncoding} onValueChange={(v) => setField('charEncoding', v)}>
          <SelectTrigger id="charEncoding" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENCODINGS.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {t(e.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="bufferTime" className="text-sm font-normal">
          {t('settings.serial.bufferTime')}
        </Label>
        <Input
          id="bufferTime"
          type="number"
          min={0}
          value={bufferTime}
          onChange={(e) => setField('bufferTime', Math.max(0, Number(e.target.value) || 0))}
          className="w-24"
        />
      </div>
    </div>
  )
}
