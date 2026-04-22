export type PwaInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let deferred: PwaInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PwaInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function getPwaInstallDeferred(): PwaInstallPromptEvent | null {
  return deferred;
}

export function clearPwaInstallDeferred() {
  deferred = null;
  notify();
}

export function subscribePwaInstall(listener: () => void) {
  listener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
