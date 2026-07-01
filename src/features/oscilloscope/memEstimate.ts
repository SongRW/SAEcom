/**
 * 预估环形缓冲内存占用：sec * rate * channels * 4 字节（Float32）。
 * 用于时间窗设置的诚实提示（动态显示当前配置预估占多少 MB）。
 */
export function estimateMemoryMB(opts: { sec: number; rate: number; channels: number }): number {
  const bytes = opts.sec * opts.rate * opts.channels * 4
  return bytes / (1024 * 1024)
}
