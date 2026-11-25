import { useEffect, useState, useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '../db/database';

/** Re-runs `load` whenever the database changes; keeps the last good value on errors. */
export function useQuery<T>(load: () => Promise<T>, initial: T, deps: unknown[] = []): T {
  const version = useSyncExternalStore(subscribe, getVersion);
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    load()
      .then((v) => alive && setValue(v))
      .catch((e) => console.warn('query failed', e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return value;
}
