import type { EventBus, EventMap } from "./types";

export function createEventBus(): EventBus {
  const listeners = new Map<keyof EventMap, Set<(data: EventMap[keyof EventMap]) => void>>();

  return {
    on<K extends keyof EventMap>(event: K, fn: (data: EventMap[K]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const eventListeners = listeners.get(event) as Set<(data: EventMap[K]) => void>;
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    off<K extends keyof EventMap>(event: K, fn: (data: EventMap[K]) => void) {
      const eventListeners = listeners.get(event) as Set<(data: EventMap[K]) => void> | undefined;
      eventListeners?.delete(fn);
    },
    emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
      const eventListeners = listeners.get(event) as Set<(data: EventMap[K]) => void> | undefined;
      if (!eventListeners) {
        return;
      }
      for (const fn of eventListeners) {
        fn(data);
      }
    },
  };
}
