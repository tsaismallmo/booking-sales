import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: string | number | null | undefined) {
  if (value == null || value === '') return '—'
  return Number(value).toLocaleString('zh-TW')
}
