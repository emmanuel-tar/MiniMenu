import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility for merging tailwind classes with clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Shared price formatter for consistency across the app
 */
export function formatPrice(amount: number, currency: string = 'NGN', exchangeRate?: number, secondaryCurrency?: string) {
  const primary = `${currency}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  if (secondaryCurrency && exchangeRate) {
    const secondaryValue = amount * exchangeRate;
    const secondary = `${secondaryCurrency}${secondaryValue.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
    return { primary, secondary, combined: `${primary} (${secondary})` };
  }
  
  return { primary, combined: primary };
}