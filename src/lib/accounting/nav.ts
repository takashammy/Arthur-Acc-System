type Listener = (path: string) => void;

let screen = "/";
const listeners = new Set<Listener>();

export function go(path: string) {
  if (screen === path) return;
  screen = path;
  for (const listener of listeners) listener(path);
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
