// 後勤人員只處理臨時單/預定單，不處理現貨單（現貨單是廠商實際訂到的餐廳位子）
export const LOGISTICS_CATEGORIES = ['臨時單', '預定單'] as const

// 純客服：有客服身份、但沒有廠商／管理員身份（很多地方權限要特別收）
export function isPureCustomerService(roles: readonly string[]) {
  return roles.includes('customer_service') && !roles.includes('vendor') && !roles.includes('admin')
}
