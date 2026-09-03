/**
 * Gemini API Client Module for Whisperer Standalone Web App.
 * Handles high-grounded API requests, dynamic confidence scoring (0-100%),
 * fast model failover (`gemini-2.0-flash`), and robust JSON parsing.
 */

export class GeminiApiClient {
  constructor(apiKey, model = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model || 'gemini-1.5-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  setModel(model) {
    this.model = model;
  }

  /**
   * Fetches list of models supported by the current API Key.
   */
  async listAvailableModels() {
    if (!this.apiKey) {
      throw new Error('API Key is required to fetch models.');
    }

    const endpoint = `${this.baseUrl}/models?key=${this.apiKey}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to fetch models (${response.status})`);
    }

    const data = await response.json();
    if (!data.models) return [];

    return data.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''));
  }

  /**
   * Generates a grounded suggested reply based strictly on the Communications Document.
   */
  async generateGroundedReply(question, speaker, documentContent, recentTranscript = []) {
    if (!this.apiKey) {
      throw new Error('Missing Gemini API Key. Please configure your API key in Settings.');
    }

    if (!documentContent || documentContent.trim().length === 0) {
      throw new Error('No Communications Document loaded. Please upload or paste a document first.');
    }

    const cleanModelName = this.model.replace(/^models\//, '');

    const systemInstruction = `You are an expert real-time Executive PR Co-Pilot during a live virtual meeting.
Your primary role is to give the speaker an INSTANT, GROUNDED, direct response based on the provided Communications Document.

CRITICAL GROUNDING & CONFIDENCE RULES:
1. Synthesize and generate your answer ('suggested_reply') based on the facts, themes, and information present in the Communications Document. Even if the exact question wording differs, use the relevant facts from the document to construct a helpful 1-2 sentence spoken reply.
2. Calculate a "confidence_score" as an INTEGER from 0 to 100 based on how explicitly and directly the document supports your answer:
   - 80 to 100: Direct, exact match in the document.
   - 40 to 79: Strongly supported or inferred from facts in the document.
   - 10 to 39: Partial context or related information.
   - 0 to 9: Not mentioned or completely unrelated to the document.
3. ONLY if the Communications Document has ZERO relevant facts or context about the question whatsoever, set "confidence_score": 0 and EXACTLY set "suggested_reply": "That is an interesting question. We will look into it and follow up with you directly after the meeting." Otherwise, ALWAYS provide a helpful, factual generated reply based on what the document does say!
4. DO NOT output HTML tags, markdown code blocks, or duplicate text. Return plain text strings only.
5. Keep 'suggested_reply' concise (1-2 sentences) for instant spoken delivery.
6. ALWAYS provide 1 logical 'anticipated_followup' question and its 'anticipated_followup_reply' so the executive is prepared for what comes next.

CRITICAL SCHEMA RULE:
In your JSON response, the 'suggested_reply' field MUST contain the ACTUAL generated spoken words that the executive should say out loud to answer the question. NEVER output placeholders, field names like 'suggested', or descriptions like 'string'.`;

    const contextSummary = recentTranscript.length > 0 
      ? recentTranscript.map(t => `${t.speaker || 'Unknown'}: ${t.text}`).slice(-3).join('\n')
      : 'None provided.';

    const userPrompt = `--- GROUNDING COMMUNICATIONS DOCUMENT ---
${documentContent.trim()}

--- RECENT MEETING CONTEXT ---
${contextSummary}

--- QUESTION TO ANSWER ---
Speaker: ${speaker}
Question: "${question}"

Generate the grounded reply in pure JSON format:`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            suggested_reply: {
              type: "STRING",
              description: "The actual generated 1-2 sentence grounded factual answer extracted strictly from the Communications Document to be spoken out loud. Must never be empty, 'suggested', or a placeholder."
            },
            confidence_score: {
              type: "INTEGER",
              description: "An integer from 0 to 100 representing how strongly the document supports this answer."
            },
            confidence_reason: {
              type: "STRING",
              description: "Brief reason explaining why this score was assigned."
            },
            bullet_points: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "1 to 2 brief key talking points from the document supporting the answer."
            },
            anticipated_followup: {
              type: "STRING",
              description: "A logical follow-up question the reporter or analyst might ask next based on this topic."
            },
            anticipated_followup_reply: {
              type: "STRING",
              description: "The 1-2 sentence grounded suggested reply for that potential follow-up question."
            }
          },
          required: ["suggested_reply", "confidence_score", "bullet_points", "anticipated_followup", "anticipated_followup_reply"]
        }
      }
    };

    const data = await this.executeWithRetryAndFallback(requestBody);
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      throw new Error('Received an empty response from Gemini API.');
    }

    return this.parseAndCleanResponse(textOutput, question, speaker);
  }

  /**
   * Executes API request with fast retry backoff and ultra-fast model failover chain prioritizing `gemini-2.0-flash`.
   */
  async executeWithRetryAndFallback(requestBody) {
    const cleanPrimaryModel = this.model.replace(/^models\//, '');
    const modelsToTry = Array.from(new Set([cleanPrimaryModel, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b']));
    let lastErrorMessage = '';

    for (const modelName of modelsToTry) {
      const endpoint = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`;
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (response.ok) {
            if (modelName !== cleanPrimaryModel) {
              console.log(`[Whisperer] Auto-failed over for speed/availability to model: ${modelName}`);
            }
            return await response.json();
          }

          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || `API error (${response.status}): ${response.statusText}`;
          lastErrorMessage = errorMessage;

          if (response.status === 404) {
            break;
          }

          if (response.status === 503 || response.status === 429 || response.status >= 500) {
            if (attempt < 2) {
              const delay = 200 + Math.floor(Math.random() * 150);
              console.warn(`[Whisperer] Model ${modelName} busy (${response.status}). Fast retry attempt 2 in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            } else {
              console.warn(`[Whisperer] ${modelName} busy after fast retry. Switching instantly to fallback model...`);
              break;
            }
          }

          throw new Error(errorMessage);
        } catch (err) {
          lastErrorMessage = err.message || 'Network fetch failed';
          if (attempt < 2 && (lastErrorMessage.includes('Failed to fetch') || lastErrorMessage.includes('Network'))) {
            await new Promise(r => setTimeout(r, 300));
            continue;
          }
          if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('Network')) {
            break;
          }
        }
      }
    }

    throw new Error(`Gemini API Request Failed after retries: ${lastErrorMessage || 'All models currently overloaded or unavailable.'}`);
  }

  /**
   * Safely parses Gemini JSON output and ensures exact standard reply when answer is not in document or when placeholder is echoed.
   */
  parseAndCleanResponse(textOutput, question, speaker) {
    const stripHtml = (str) => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';

    let cleanJson = textOutput.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```$/, '').trim();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('JSON parse failed, attempting regex extraction:', e);
    }

    let suggestedReply = '';
    let confidenceScore = 85;
    let confidenceReason = '';
    let bulletPoints = [];
    let groundingSources = [];
    let anticipatedFollowup = '';
    let anticipatedFollowupReply = '';

    if (parsed && typeof parsed === 'object') {
      suggestedReply = parsed.suggested_reply || '';
      if (parsed.confidence_score !== undefined && parsed.confidence_score !== null) {
        confidenceScore = Number(parsed.confidence_score);
        if (isNaN(confidenceScore)) confidenceScore = 85;
      }
      confidenceReason = parsed.confidence_reason || '';
      bulletPoints = (parsed.bullet_points || []).map(stripHtml).filter(Boolean);
      groundingSources = (parsed.grounding_sources || []).map(stripHtml).filter(Boolean);
      anticipatedFollowup = stripHtml(parsed.anticipated_followup || '');
      anticipatedFollowupReply = stripHtml(parsed.anticipated_followup_reply || '');
    } else {
      const replyRegex = /"suggested_reply"\s*:\s*"((?:[^"\\]|\\.)*)"/s;
      const replyMatch = textOutput.match(replyRegex);
      if (replyMatch) {
        suggestedReply = replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
      } else {
        const partialMatch = textOutput.match(/"suggested_reply"\s*:\s*"([^"]*)$/s);
        if (partialMatch) {
          suggestedReply = partialMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        } else {
          suggestedReply = textOutput
            .replace(/^[\s\S]*?"suggested_reply"\s*:\s*"?/i, '')
            .replace(/"?\s*,\s*"confidence_score"[\s\S]*$/i, '')
            .replace(/[{}"]/g, '')
            .trim();
        }
      }

      const confMatch = textOutput.match(/"confidence_score"\s*:\s*(\d+)/);
      if (confMatch) {
        confidenceScore = parseInt(confMatch[1], 10);
      }
    }

    const cleanedScore = Math.min(100, Math.max(0, confidenceScore));
    let finalReply = stripHtml(suggestedReply);

    const lowerReply = finalReply.toLowerCase().trim();
    const isBogusPlaceholder = !finalReply ||
      lowerReply === 'suggested' ||
      lowerReply === 'suggested reply' ||
      lowerReply === 'suggested_reply' ||
      lowerReply === 'string' ||
      lowerReply.startsWith('[insert') ||
      lowerReply.includes('concise direct spoken reply') ||
      lowerReply.includes('concise 1-2 sentence factual answer');

    const isNotCovered = cleanedScore <= 5 ||
      lowerReply.includes('not covered in') ||
      lowerReply.includes('not mentioned in') ||
      lowerReply.includes('does not cover') ||
      lowerReply.includes('does not mention');

    if (isBogusPlaceholder && !isNotCovered) {
      if (anticipatedFollowupReply && anticipatedFollowupReply.length > 15 && anticipatedFollowupReply.toLowerCase() !== 'suggested') {
        finalReply = anticipatedFollowupReply;
      } else if (bulletPoints && bulletPoints.length > 0) {
        finalReply = bulletPoints.join(' ');
      } else if (confidenceReason && confidenceReason.length > 15) {
        finalReply = confidenceReason;
      }
    }

    if (isNotCovered || !finalReply || finalReply.toLowerCase().trim() === 'suggested' || finalReply.toLowerCase().trim() === 'string') {
      finalReply = "That is an interesting question. We will look into it and follow up with you directly after the meeting.";
    }

    return {
      question,
      speaker,
      timestamp: new Date().toISOString(),
      suggestedReply: finalReply,
      confidenceScore: cleanedScore,
      confidenceReason,
      bulletPoints,
      groundingSources,
      anticipatedFollowup,
      anticipatedFollowupReply
    };
  }
}
