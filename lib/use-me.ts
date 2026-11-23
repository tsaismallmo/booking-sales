'use client'

// 目前登入的人（/api/me）：同一次載入頁面只抓一次，所有元件共用。
// 切換代理廠商會整頁重新載入，所以不用擔心快取舊的 vendorScopeId。
export type Me = {
  id: string
  email: string | null
  name: string | null
  roles: string[]
  employerVendorId: string | null
  vendorScopeId: string | null
}

let cached: Promise<Me> | null = null

export function fetchMe(): Promise<Me> {
  cached ??= fetch('/api/me')
    .then((res) => (res.ok ? res.json() : {}))
    .then((me: Partial<Me>) => ({ ...me, roles: Array.isArray(me?.roles) ? me.roles : [] }) as Me)
    .catch(() => {
      cached = null
      return { id: '', email: null, name: null, roles: [], employerVendorId: null, vendorScopeId: null }
    })
  return cached
}
