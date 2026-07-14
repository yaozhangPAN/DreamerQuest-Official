/**
 * Fetch a public article URL and extract readable plain text for MCQ generation.
 */
export async function fetchArticleFromUrl(url: string): Promise<{
  url: string;
  title: string;
  article: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('Invalid URL. Use a full link starting with https://');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https links are supported.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  let html: string;
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; DreamerQuestBot/1.0; +https://localhost)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`Could not open link (HTTP ${response.status}).`);
    }
    html = await response.text();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Timed out opening the link. Try another URL.');
    }
    throw new Error(e?.message || 'Failed to open the article link.');
  } finally {
    clearTimeout(timer);
  }

  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = decodeHtml((titleMatch?.[1] || '').trim()) || parsed.hostname;

  const article = htmlToPlainText(html);
  if (article.length < 80) {
    throw new Error(
      'Could not extract enough article text from that link. The page may be blocked or mostly images/JS.',
    );
  }

  return {
    url: parsed.toString(),
    title,
    article: article.slice(0, 20000),
  };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const articleMatch = text.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) text = articleMatch[0];

  text = text
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '');

  return decodeHtml(
    text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n'),
  );
}
