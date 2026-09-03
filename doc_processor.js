/**
 * Document Processor Module for Whisperer Standalone Web App.
 * Handles parsing and storage of the grounded Communications Document using localStorage.
 */

export class DocProcessor {
  constructor() {
    this.STORAGE_KEY = 'whisperer_active_doc';
  }

  processText(text, fileName = 'Uploaded Document') {
    if (!text || text.trim().length === 0) {
      throw new Error('Provided document text is empty.');
    }

    const cleanText = text.trim();
    const wordCount = cleanText.split(/\s+/).length;

    const sections = [];
    const lines = cleanText.split('\n');
    let currentSection = { header: 'General Overview', content: [] };

    const headerRegex = /^(?:#+\s+|[A-Z0-9.\-\s]{4,}:|^Q:\s*|^Question:\s*)/;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (headerRegex.test(trimmed) && trimmed.length < 100) {
        if (currentSection.content.length > 0) {
          sections.push({
            header: currentSection.header,
            content: currentSection.content.join('\n').trim()
          });
        }
        currentSection = { header: trimmed.replace(/^#+\s*/, ''), content: [] };
      } else {
        currentSection.content.push(line);
      }
    });

    if (currentSection.content.length > 0) {
      sections.push({
        header: currentSection.header,
        content: currentSection.content.join('\n').trim()
      });
    }

    return {
      rawText: cleanText,
      wordCount,
      fileName,
      updatedAt: new Date().toISOString(),
      sections
    };
  }

  saveToStorage(docObj) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(docObj));
      return docObj;
    } catch (e) {
      console.error('Failed to save document to localStorage:', e);
      throw new Error('Storage quota exceeded or unavailable when saving document.');
    }
  }

  loadFromStorage() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load document from localStorage:', e);
      return null;
    }
  }

  clearStorage() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
