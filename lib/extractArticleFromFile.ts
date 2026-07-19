/** Extract plain text from an uploaded article file (txt / doc / docx / pdf). */
export async function extractArticleTextFromFile(file: File): Promise<{
  title: string;
  article: string;
}> {
  const name = file.name || 'article';
  const lower = name.toLowerCase();
  const baseTitle = name.replace(/\.(txt|docx?|pdf)$/i, '').trim() || 'Uploaded article';

  if (lower.endsWith('.txt') || file.type === 'text/plain') {
    const article = (await file.text()).trim();
    if (article.length < 40) {
      throw new Error('This text file is too short. Please upload a fuller article.');
    }
    return { title: baseTitle, article: article.slice(0, 20000) };
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const article = String(result.value || '').trim();
    if (article.length < 40) {
      throw new Error('Could not extract enough text from this Word document.');
    }
    return { title: baseTitle, article: article.slice(0, 20000) };
  }

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsDataURL(file);
    });
    const { extractArticleFromFileApi } = await import('./articleQuizApi');
    return extractArticleFromFileApi({
      filename: name,
      mimeType: file.type || 'application/pdf',
      dataBase64: dataUrl,
    });
  }

  throw new Error('Unsupported file type. Please upload PDF, DOC, DOCX, or TXT.');
}
