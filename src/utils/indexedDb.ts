export interface SoundItem {
  id: string;
  name: string;
  audioBlob: Blob;
  keybind: string; // e.g. "1", "a", "Space"
  volume: number; // 0 to 1
  loop: boolean;
  color: string; // hex color or gradient name
  createdAt: number;
}

const DB_NAME = 'soundboard_db';
const DB_VERSION = 1;
const STORE_NAME = 'sounds';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in the browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB: ' + request.error?.message));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function getAllSounds(): Promise<SoundItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to get sounds: ' + request.error?.message));
    };

    request.onsuccess = () => {
      // Sort by creation date
      const result = request.result as SoundItem[];
      result.sort((a, b) => a.createdAt - b.createdAt);
      resolve(result);
    };
  });
}

export async function saveSound(sound: SoundItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(sound);

    request.onerror = () => {
      reject(new Error('Failed to save sound: ' + request.error?.message));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

export async function deleteSound(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error('Failed to delete sound: ' + request.error?.message));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}
