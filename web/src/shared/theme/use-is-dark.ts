import { useSyncExternalStore } from 'react';

// Whether <html> has the dark class, kept live: the class can change from the toggle or the
// system preference, and values that the DOM cannot theme with CSS (Leaflet's SVG attributes) follow it.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
