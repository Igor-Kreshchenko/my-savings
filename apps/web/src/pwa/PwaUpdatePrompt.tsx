import { useEffect, useState } from 'react';

type ActivateServiceWorker = () => void;

export function PwaUpdatePrompt() {
  const [activateUpdate, setActivateUpdate] =
    useState<ActivateServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    function showUpdateIfWaiting(): void {
      if (
        disposed ||
        !registration?.waiting ||
        !navigator.serviceWorker.controller
      ) {
        return;
      }

      setActivateUpdate(() => () => {
        const waitingWorker = registration?.waiting;
        if (!waitingWorker) {
          setActivateUpdate(null);
          return;
        }

        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          { once: true },
        );
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      });
    }

    function handleUpdateFound(): void {
      const installingWorker = registration?.installing;
      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed') {
          showUpdateIfWaiting();
        }
      });
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((activeRegistration) => {
        if (disposed) {
          return;
        }

        registration = activeRegistration;
        registration.addEventListener('updatefound', handleUpdateFound);
        showUpdateIfWaiting();
      })
      .catch((error: unknown) => {
        console.error('Failed to register the service worker', error);
      });

    return () => {
      disposed = true;
      registration?.removeEventListener('updatefound', handleUpdateFound);
    };
  }, []);

  if (activateUpdate === null) {
    return null;
  }

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <span>A new version is ready.</span>
      <button
        className="pwa-update-button"
        type="button"
        onClick={activateUpdate}
      >
        Update
      </button>
      <button
        className="pwa-dismiss-button"
        type="button"
        aria-label="Dismiss update notice"
        onClick={() => setActivateUpdate(null)}
      >
        Later
      </button>
    </aside>
  );
}
