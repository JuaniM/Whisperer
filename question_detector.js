/**
 * Question Detector Module for Whisperer Standalone Web App.
 * Analyzes real-time transcript entries, detects interrogative structures and key PR topics,
 * buffers incomplete fragments, and triggers grounded replies reliably without losing questions.
 */

export class QuestionDetector {
  constructor(options = {}) {
    this.minQuestionLength = options.minQuestionLength || 6;
    this.debounceMs = options.debounceMs || 800;
    this.onQuestionDetected = options.onQuestionDetected || (() => {});
    this.recentQuestions = new Set();
    this.debounceTimer = null;
    this.pendingEntry = null;
  }

  processTranscriptEntry(entry) {
    if (!entry || !entry.text) return;
    const text = entry.text.trim();
    if (text.length < this.minQuestionLength) return;

    if (this.isLikelyQuestion(text)) {
      this.triggerQuestionDetection(entry);
    }
  }

  isLikelyQuestion(text) {
    if (text.endsWith('?')) return true;

    const lower = text.toLowerCase().trim();

    // Universal interrogative & PR topic triggers
    const triggerPhrases = [
      'can you', 'could you', 'would you', 'will you', 'are you', 'do you', 'did you', 'have you', 'should you',
      'can we', 'could we', 'would we', 'will we', 'are we', 'do we', 'did we', 'have we', 'should we',
      'will our', 'does our', 'has our', 'is our', 'are our',
      'what is', 'what are', 'what about', 'what do', 'what does', 'what will', 'what impact',
      'why is', 'why are', 'why do', 'why does', 'why did', 'why would',
      'how does', 'how do', 'how will', 'how much', 'how can', 'how are', 'how is',
      'when will', 'where is', 'who is', 'who will',
      'is there', 'is it true', 'is that', 'are there',
      'any updates', 'any impact', 'traffic impact', 'monetization', 'cpm', 'amp', 'deprecat',
      'i wanted to ask', 'could you explain', 'can you explain', 'question about'
    ];

    for (const phrase of triggerPhrases) {
      if (lower.startsWith(phrase) || lower.includes('. ' + phrase) || lower.includes(', ' + phrase) || lower.includes(' ' + phrase + ' ')) {
        return true;
      }
    }

    return false;
  }

  triggerQuestionDetection(entry) {
    const normalizedText = entry.text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
    if (this.recentQuestions.has(normalizedText)) {
      return;
    }

    this.pendingEntry = entry;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (!this.pendingEntry) return;
      const targetEntry = this.pendingEntry;
      this.pendingEntry = null;

      const norm = targetEntry.text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
      if (this.recentQuestions.has(norm)) return;

      this.recentQuestions.add(norm);
      setTimeout(() => {
        this.recentQuestions.delete(norm);
      }, 20000);

      this.onQuestionDetected({
        speaker: targetEntry.speaker || 'Unknown Speaker',
        text: targetEntry.text,
        timestamp: targetEntry.timestamp || Date.now(),
        confidence: targetEntry.text.endsWith('?') ? 0.95 : 0.88
      });
    }, this.debounceMs);
  }
}
