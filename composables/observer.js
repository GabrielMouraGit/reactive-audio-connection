export function createObserver() {
  const listeners = new Map();

  function register(type, callback) {
    if (!listeners.has(type)) {
      listeners.set(type, []);
    }
    listeners.get(type).push(callback);
    return () => {
      const items = listeners.get(type) || [];
      listeners.set(type, items.filter((fn) => fn !== callback));
    };
  }

  function notify(type, payload) {
    const items = listeners.get(type) || [];
    for (const callback of items) {
      callback(payload);
    }
  }

  return { register, notify };
}
