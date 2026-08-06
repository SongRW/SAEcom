/**
 * IPC 统一响应类型规范。
 *
 * 现有 main.ts 大量 handler 返回 `{ ok: true, ... }` / `{ ok: false, error }` 形态，
 * 此处把该约定固化为类型，便于 router 层统一错误边界与 renderer 侧收窄。
 *
 * 注意：这是「向后兼容的收口」，不强制改写已存在的 handler 返回值——
 * 仅在新写的 service/router 使用；纯重构段保持各域返回形状字节级一致。
 */
export type Ok<T = unknown> = { ok: true } & T
export type Err = { ok: false; error: string; canceled?: boolean }
export type Result<T = unknown> = Ok<T> | Err

export function ok<T>(extra: T = {} as T): Ok<T> {
  return { ok: true, ...extra }
}

export function err(error: string): Err {
  return { ok: false, error }
}

export function canceled(): Err {
  return { ok: false, error: 'canceled', canceled: true }
}

export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.ok === true
}

export function isErr<T>(r: Result<T>): r is Err {
  return r.ok === false
}
