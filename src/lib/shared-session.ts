/** One browser subscription/read shared by all mounted auth consumers. */
export function createSharedSessionStore<T>(source: {
  read: () => Promise<T | null>;
  listen: (onSession: (session: T | null) => void) => () => void;
}) {
  type Snapshot = { session: T | null; loading: boolean };
  const initial: Snapshot = { session: null, loading: true };
  let snapshot = initial;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  let generation = 0;
  let revision = 0;
  function publish(session: T | null) {
    snapshot = { session, loading: false };
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    // SSR must never see browser session state.
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const activeGeneration = ++generation;
        const beforeRead = revision;
        stop = source.listen((session) => {
          if (generation !== activeGeneration) return;
          revision++;
          publish(session);
        });
        void source.read().then((session) => {
          if (generation === activeGeneration && revision === beforeRead) publish(session);
        }).catch(() => {
          if (generation === activeGeneration && revision === beforeRead) publish(null);
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          generation++;
          stop?.();
          stop = undefined;
          snapshot = initial;
        }
      };
    },
  };
}