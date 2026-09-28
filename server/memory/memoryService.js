/**
 * server/memory/memoryService.js
 * High-level Hindsight Memory Service for TrustMemory AI.
 * Handles bank resolution (helper-{helper_id}), retain, recall, reflect, and pre-call context.
 */

const { hindsight } = require('./hindsightClient');
const { extractDurableMemories } = require('./memoryExtractor');
const { buildAgentMemoryContext } = require('./memoryContextBuilder');

/**
 * Resolve stable Hindsight memory bank identifier.
 * NEVER uses phone numbers as bank IDs.
 */
function getHelperBankId(helperId) {
  if (!helperId) {
    throw new Error('Helper ID is required to resolve Hindsight memory bank.');
  }

  const raw = String(helperId).trim();
  // Dialing safeguard: verify phone number was not passed as helper ID
  if (raw.startsWith('+') || /^\+?\d{10,15}$/.test(raw.replace(/[\s-]/g, ''))) {
    throw new Error(`Invalid bank identifier: Phone numbers cannot be used as memory bank IDs (${raw}).`);
  }

  const clean = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return clean.startsWith('helper-') ? clean : `helper-${clean}`;
}

class MemoryService {
  /**
   * Health check for Hindsight memory system
   */
  async checkHealth() {
    return await hindsight.checkHealth();
  }

  /**
   * Create or resolve a helper's dedicated memory bank
   */
  async createOrGetHelperMemoryBank(helperId, helperName) {
    const bankId = getHelperBankId(helperId);
    try {
      return await hindsight.createBank(bankId, {
        name: `${helperName || 'Helper'} Attendance & Coaching Memory Bank`,
        mission: 'Maintain durable memory of attendance variance root causes, agreed departure commitments, and communication habits.',
        background: 'Indian Home-Care Agency intelligence system maintaining continuity across helper coaching calls.'
      });
    } catch (err) {
      console.warn(`[MemoryService] Failed to create bank "${bankId}": ${err.message}. Proceeding safely.`);
      return { success: false, bank_id: bankId, error: err.message };
    }
  }

  /**
   * Recall memories for helper before an outbound call
   */
  async recallHelperMemory(helperId, query) {
    const bankId = getHelperBankId(helperId);
    const recallQuery = query || 'Previous attendance conversations, reasons for lateness, commitments, unresolved concerns, and communication commitments for this helper.';
    try {
      return await hindsight.recall(bankId, recallQuery, { budget: 'mid' });
    } catch (err) {
      console.warn(`[MemoryService] Memory recall failed for "${bankId}": ${err.message}. Returning empty memory.`);
      return { results: [], chunks: {}, entities: {}, error: err.message };
    }
  }

  /**
   * Reflect over helper's conversation history
   */
  async reflectOnHelperHistory(helperId, query) {
    const bankId = getHelperBankId(helperId);
    const reflectQuery = query || 'Based on this helper\'s previous conversations and commitments, what relevant context should the voice agent know before today\'s attendance check-in?';
    try {
      return await hindsight.reflect(bankId, reflectQuery, { budget: 'low' });
    } catch (err) {
      console.warn(`[MemoryService] Memory reflect failed for "${bankId}": ${err.message}.`);
      return { text: null, error: err.message };
    }
  }

  /**
   * Build complete pre-call memory context for the Voice Agent
   */
  async buildAgentMemoryContext(helperId, helperName, options = {}) {
    const bankId = getHelperBankId(helperId);
    try {
      // 1. Ensure memory bank exists
      await this.createOrGetHelperMemoryBank(helperId, helperName);

      // 2. Recall relevant memories
      const recallResponse = await this.recallHelperMemory(helperId);

      // 3. Reflect over previous interactions
      const reflectResponse = await this.reflectOnHelperHistory(helperId);

      // 4. Build concise bulleted context and natural opening dialogue hook
      const context = buildAgentMemoryContext(helperName, recallResponse, reflectResponse);
      context.bank_id = bankId;
      return context;
    } catch (err) {
      console.warn(`[MemoryService] buildAgentMemoryContext failed for "${bankId}": ${err.message}. Providing fallback.`);
      return {
        bank_id: bankId,
        has_previous_memory: false,
        context_prompt: 'Memory service unavailable. Proceeding with standard coaching check-in.',
        opening_dialogue_hook: `Hi ${(helperName || 'Anita').split(' ')[0]}, this is a quick check-in from the agency. We noticed a couple of late arrivals recently — is everything alright?`,
        bullet_summary: ['Memory service unavailable.'],
        memory_guidance: 'Fallback to current call context.'
      };
    }
  }

  /**
   * Retain durable facts from a completed call into Hindsight
   */
  async retainCallMemory({
    helperId,
    helperName,
    lateCount,
    scenario,
    transcript,
    outcome,
    callDate
  }) {
    const bankId = getHelperBankId(helperId);

    // 1. Extract durable natural language facts (never dumps raw transcripts)
    const { durableSummary, structuredCategories, tags, metadata } = extractDurableMemories({
      helperId,
      helperName,
      lateCount,
      scenario,
      transcript,
      outcome,
      callDate
    });

    try {
      // 2. Retain into Hindsight bank
      const retainResult = await hindsight.retain(bankId, durableSummary, {
        timestamp: callDate || new Date().toISOString(),
        context: `${scenario || 'Coaching Call'} check-in regarding ${lateCount || 2} late arrival(s)`,
        metadata: {
          ...metadata,
          structured_categories: structuredCategories
        },
        tags
      });

      console.log(`[MemoryService] Successfully retained call memory in Hindsight bank "${bankId}".`);
      return {
        success: true,
        bank_id: bankId,
        durableSummary,
        structuredCategories,
        retainResult
      };
    } catch (err) {
      console.warn(`[MemoryService] Failed to retain memory in Hindsight bank "${bankId}": ${err.message}.`);
      return {
        success: false,
        bank_id: bankId,
        durableSummary,
        error: err.message
      };
    }
  }
}

const memoryService = new MemoryService();

module.exports = {
  memoryService,
  getHelperBankId
};
