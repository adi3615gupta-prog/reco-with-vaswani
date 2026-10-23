import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const safeGetItem = (key: string, isLocal = false) => {
  try {
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    return storage.getItem(key);
  } catch (e) {
    console.warn(`Storage access denied for key "${key}":`, e);
    return null;
  }
};

export const safeSetItem = (key: string, value: string, isLocal = false) => {
  try {
    if (value && value.length > 2 * 1024 * 1024) {
      console.warn(`Storage payload for "${key}" exceeds 2MB (${(value.length / 1024 / 1024).toFixed(1)}MB). Skipping storage write.`);
      return;
    }
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    storage.setItem(key, value);
  } catch (e) {
    console.warn(`Storage write failed for key "${key}":`, e);
  }
};

export const safeRemoveItem = (key: string, isLocal = false) => {
  try {
    const storage = isLocal ? window.localStorage : window.sessionStorage;
    storage.removeItem(key);
  } catch (e) {
    console.warn(`Storage deletion failed for key "${key}":`, e);
  }
};

