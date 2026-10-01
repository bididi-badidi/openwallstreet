import { extractText, getDocumentProxy } from 'unpdf';
import type { Page, Snapshot } from './data';

export function sourceUrl(value: string, hosts: string[]) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !hosts.includes(url.hostname)) throw new Error('source_host_not_allowed');
  return url;
}
export async function boundedBytes(response: Response, limit: number) {
  if (!response.body) throw new Error('empty_source');
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body.cancel(); throw new Error('source_size_limit');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error('source_size_limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function retrieve(value: string, hosts: string[]): Promise<Snapshot> {
  let url = sourceUrl(value, hosts);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'WallstreetEvidenceResearch/1.0', Accept: 'application/pdf,text/html' } });
    if (![301,302,303,307,308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || redirects === 4) throw new Error('source_redirect_limit');
    url = sourceUrl(new URL(location, url).href, hosts);
  }
  if (!response?.ok) { await response?.body?.cancel(); throw new Error('source_unavailable'); }
  const raw = await boundedBytes(response, 8_000_000);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)),
    b => b.toString(16).padStart(2, '0')).join('');
  const isPdf = new TextDecoder().decode(raw.slice(0, 5)) === '%PDF-';
  let texts: string[], method: string;
  if (isPdf) {
    const pdf = await getDocumentProxy(raw, { useSystemFonts: false });
    try {
      if (pdf.numPages > 300) throw new Error('source_page_limit');
      const result = await extractText(pdf, { mergePages: false });
      texts = result.text; method = 'PDF text extraction; physical page numbers';
    } finally { await pdf.loadingTask.destroy(); }
  } else {
    if (url.pathname.toLowerCase().endsWith('.pdf')) throw new Error('pdf_returned_html');
    if (!response.headers.get('content-type')?.includes('html')) throw new Error('unsupported_source_type');
    // Remove active/non-evidence content before collecting visible text.
    const cleaned = new HTMLRewriter().on('script,style,noscript,svg,nav', {
      element(element) { element.remove(); },
    }).transform(new Response(raw, { headers: { 'Content-Type': 'text/html' } }));
    const parts: string[] = [];
    const text = new HTMLRewriter().on('*', { element(element) {
      if (['p','div','tr','h1','h2','h3','li','br'].includes(element.tagName)) parts.push('\n');
    } }).onDocument({ text(chunk) { parts.push(chunk.text); } }).transform(cleaned);
    await boundedBytes(text, 8_000_000);
    texts = [parts.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')];
    method = 'HTML visible text; synthetic page 1';
  }
  if (texts.join('').trim().length < 500) throw new Error('source_text_unavailable');
  let remaining = 360_000;
  const pages = texts.map((text, i) => {
    const slice = text.slice(0, Math.max(remaining, 0)); remaining -= slice.length;
    return { page: i + 1, text: slice };
  }).filter(p => p.text.length);
  return { url: url.href, sha256, retrieved_at: new Date().toISOString(), pages,
    method, total_pages: texts.length, truncated: texts.reduce((n, t) => n + t.length, 0) > 360_000 };
}
export function pageChunks(pages: Page[], limit = 60_000): Page[][] {
  const chunks: Page[][] = [];
  let current: Page[] = [], size = 0;
  for (const page of pages) for (let i = 0; i < page.text.length; i += limit) {
    const text = page.text.slice(i, i + limit);
    if (size + text.length > limit && current.length) { chunks.push(current); current = []; size = 0; }
    current.push({ page: page.page, text }); size += text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
export function sourceSpan(excerpt: string, text: string) {
  if (!excerpt.trim()) return null;
  if (text.includes(excerpt)) return excerpt;
  const pattern = excerpt.trim().split(/\s+/).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return text.match(new RegExp(pattern))?.[0] ?? null;
}
