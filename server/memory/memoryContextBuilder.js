/**
 * server/memory/memoryContextBuilder.js
 * Builds concise, natural pre-call context for the Voice Agent from Hindsight recall & reflection.
 * Enforces memory precedence rules: current helper statements ALWAYS override old memories.
 */

function buildAgentMemoryContext(helperName, recallResponse, reflectResponse) {
  const name = helperName || 'Helper';
  const firstName = name.split(' ')[0];

  const results = recallResponse?.results || [];
  const hasHistory = results.length > 0;

  if (!hasHistory) {
    return {
      has_previous_memory: false,
      context_prompt: `No previous attendance check-in memory found for ${name}. This is the initial warm check-in.`,
      opening_dialogue_hook: `Hi ${firstName}, this is a quick check-in from the agency. We noticed a couple of late arrivals recently — is everything alright?`,
      bullet_summary: [
        'No previous attendance conversations on record.',
        'Establish root cause respectfully.',
        'Secure practical timing improvement.'
      ],
      memory_guidance: 'Do not invent previous history. Treat as first conversation.'
    };
  }

  // Parse the most recent memory record
  const latestMemory = results[0].text;
  let prevIssue = 'public transport delays';
  let prevCommitment = 'take an earlier bus';
  let prevNotice = 'notify household if more than 10 minutes late';
  let prevOutcome = 'commitment accepted';
  let checkInDaysAgo = 14;

  if (latestMemory.includes('bus') || latestMemory.includes('transit') || latestMemory.includes('traffic')) {
    prevIssue = 'transit delays on bus route';
  } else if (latestMemory.includes('family') || latestMemory.includes('morning routine')) {
    prevIssue = 'morning family/routine preparation';
  }

  if (latestMemory.includes('07:15 AM') || latestMemory.includes('7:15')) {
    prevCommitment = 'take earlier 7:15 AM bus';
  } else if (latestMemory.includes('earlier bus')) {
    prevCommitment = 'take an earlier bus';
  } else if (latestMemory.includes('30 min')) {
    prevCommitment = 'leave 30 minutes earlier';
  }

  if (results[0].occurred_start) {
    try {
      const past = new Date(results[0].occurred_start);
      const diffMs = Date.now() - past.getTime();
      const days = Math.round(diffMs / 86400000);
      if (days > 0) checkInDaysAgo = days;
    } catch(e) {}
  }

  const bullet_summary = [
    `Previous issue: ${prevIssue}.`,
    `Previous commitment: ${prevCommitment}.`,
    `Previous communication commitment: ${prevNotice}.`,
    `Previous check-in: ${checkInDaysAgo} days ago.`,
    `Previous outcome: ${prevOutcome}.`
  ];

  const opening_dialogue_hook = `Hi ${firstName}, this is a quick check-in from the agency. Last time we spoke, you mentioned that ${prevIssue} was causing delays and you were going to try ${prevCommitment}. How has that been working for you?`;

  const context_prompt = `Previous relevant context:
* Previous issue: ${prevIssue}.
* Previous commitment: ${prevCommitment}.
* Previous communication commitment: ${prevNotice}.
* Previous check-in: ${checkInDaysAgo} days ago.
* Previous outcome: ${prevOutcome}.

Hindsight Reflection:
${reflectResponse?.text || 'Helper previously committed to an earlier departure. Follow up gently on whether this timing held or if route conditions changed.'}

EPISTEMIC MEMORY RULES:
1. Current information is AUTHORITATIVE. If ${firstName} reports a new issue or that the earlier bus was cancelled, adapt immediately.
2. NEVER say "I retrieved your Hindsight memory" or reference software internal state.
3. NEVER argue ("But you previously said..."). Acknowledge gracefully ("Okay, I understand. Thanks for letting me know.") and update understanding.`;

  return {
    has_previous_memory: true,
    context_prompt,
    opening_dialogue_hook,
    bullet_summary,
    reflection_text: reflectResponse?.text || null,
    raw_facts: results.map(r => r.text)
  };
}

module.exports = {
  buildAgentMemoryContext
};
