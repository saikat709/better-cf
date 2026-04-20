import type { CodeFile, PersistedState } from './types';

const DB_NAME = 'better-cp-editor';
const DB_VERSION = 1;
const FILE_STORE = 'files';
const META_STORE = 'meta';

const idbRequest = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const idbTransactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

const loadState = async (): Promise<{ files: CodeFile[]; meta?: PersistedState }> => {
  const db = await openDb();
  const tx = db.transaction([FILE_STORE, META_STORE], 'readonly');
  const filesRequest = tx.objectStore(FILE_STORE).getAll();
  const metaRequest = tx.objectStore(META_STORE).get('session');
  const [files, meta] = await Promise.all([
    idbRequest(filesRequest) as Promise<CodeFile[]>,
    idbRequest(metaRequest) as Promise<PersistedState | undefined>,
  ]);
  await idbTransactionDone(tx);
  db.close();
  return { files, meta };
};

const saveState = async (files: CodeFile[], activeFileId: string, input: string): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction([FILE_STORE, META_STORE], 'readwrite');
  const filesStore = tx.objectStore(FILE_STORE);
  const metaStore = tx.objectStore(META_STORE);

  const existingFiles = (await idbRequest(filesStore.getAllKeys())) as string[];
  const nextIds = new Set(files.map((file) => file.id));

  for (const file of files) filesStore.put(file);
  for (const key of existingFiles) {
    if (!nextIds.has(key)) filesStore.delete(key);
  }

  metaStore.put({ key: 'session', activeFileId, input });
  await idbTransactionDone(tx);
  db.close();
};

export { loadState, saveState };
