export const inMemorySecureStore = new Map<string, string>();

export const getItemAsync = async (key: string): Promise<string | null> => {
  return inMemorySecureStore.get(key) ?? null;
};

export const setItemAsync = async (key: string, value: string): Promise<void> => {
  inMemorySecureStore.set(key, value);
};

export const deleteItemAsync = async (key: string): Promise<void> => {
  inMemorySecureStore.delete(key);
};

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 1;

export function clearMockSecureStore(): void {
  inMemorySecureStore.clear();
}

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
