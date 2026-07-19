/**
 * IndexedDB store for Director audio tracks. localStorage can't hold multi-MB
 * base64 (the zustand persist layer strips `audioB64` for quota), so the raw
 * data URI lives here keyed by the track's id and is re-attached on rehydrate
 * and on project switch. All helpers are no-ops outside the browser.
 */

const DB_NAME = 'aipg-director-audio';
const STORE = 'tracks';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveAudioTrack(id: string, audioB64: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(audioB64, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function loadAudioTrack(id: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const value = await new Promise<string | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return value;
}

export async function deleteAudioTrack(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
