/** URL do Figma: https, host figma.com ou subdomínio, com caminho. */
export function isFigmaUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === 'https:' &&
    (host === 'figma.com' || host.endsWith('.figma.com')) &&
    url.pathname.length > 1
  );
}
