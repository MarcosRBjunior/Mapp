// The tiles attribution comes from env as HTML (Leaflet renders it); outside Leaflet we show text only.
export function htmlToText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
