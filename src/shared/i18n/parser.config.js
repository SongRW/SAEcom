/**
 * i18next-parser 配置：从 src/ 提取 t('key') 用法，增量更新 locale json。
 * 用法：npm run i18n:extract
 */
export default {
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/shared/i18n/locales/$LOCALE.json',
  locales: ['zh-CN', 'en-US'],
  sort: true,
  // 已有翻译保留，新 key 留空待填
  createOldVersions: false,
  keySeparator: '.',
  nsSeparator: false,
  // 使用 keyAsDefault：缺省值回退到 key 本身（我们手填中文值，不让 parser 覆盖）
  defaultValue: '',
  // 复数 / 插值占位识别
  pluralSeparator: '_',
  skipDefaultValues: true
}
