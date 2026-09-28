/**
 * server/memory/memoryExtractor.js
 * Extracts durable natural-language memories from completed voice coaching calls.
 * Enforces privacy, drops raw transcripts, and filters out sensitive information (OTPs/passwords).
 */

function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    // Redact OTPs, 4-6 digit security codes
    .replace(/\b\d{4,6}\b/g, '[REDACTED_CODE]')
    // Redact passwords, credit cards, UPI handles
    .replace(/(password|pwd|otp|pin|cvv)[\s:=]+[^\s,;]+/gi, '$1: [REDACTED]')
    .replace(/\b\d{16}\b/g, '[REDACTED_CARD]')
    .replace(/\b[\w.-]+@[\w.-]+\b/g, '[REDACTED_EMAIL]');
}

/**
 * Extract durable structured facts from call data
 */
function extractDurableMemories({
  helperId,
  helperName,
  lateCount,
  scenario,
  transcript,
  outcome,
  callDate
}) {
  const dateStr = callDate || new Date().toISOString().split('T')[0];
  const name = helperName || 'Helper';
  const firstName = name.split(' ')[0];
  const lateNum = lateCount || 2;

  let reason = outcome?.root_cause_identified || null;
  let action = outcome?.specific_commitment || null;
  let commCommitment = outcome?.notification_commitment !== false;
  let callOutcome = outcome?.sentiment === 'cooperative' ? 'commitment accepted' : 'unresolved';

  // If transcript is provided, extract insights from dialogues if not already in outcome
  if (Array.isArray(transcript) && transcript.length > 0) {
    const helperLines = transcript
      .filter(t => t.who && !t.who.toLowerCase().includes('agent'))
      .map(t => sanitizeText(t.text))
      .join(' ');

    if (!reason) {
      if (helperLines.toLowerCase().includes('bus') || helperLines.toLowerCase().includes('traffic') || helperLines.toLowerCase().includes('road work') || helperLines.toLowerCase().includes('route')) {
        reason = 'transit delay on regular bus route';
      } else if (helperLines.toLowerCase().includes('family') || helperLines.toLowerCase().includes('child') || helperLines.toLowerCase().includes('school')) {
        reason = 'morning family/household routine constraints';
      } else {
        reason = 'travel timing variance';
      }
    }

    if (!action) {
      if (helperLines.toLowerCase().includes('7:15') || helperLines.toLowerCase().includes('earlier bus')) {
        action = 'take earlier bus at 07:15 AM';
      } else if (helperLines.toLowerCase().includes('leave earlier') || helperLines.toLowerCase().includes('30 min')) {
        action = 'depart 30 minutes earlier from tomorrow';
      } else {
        action = 'adjust morning schedule to arrive before start time';
      }
    }
  }

  // Fallbacks if nothing could be determined
  if (!reason) reason = 'transit delay on regular bus route';
  if (!action) action = 'take earlier bus at 07:15 AM';

  // Construct durable natural-language memory fact
  let durableSummary = `On ${dateStr}, helper ${firstName} explained that recent late arrivals (${lateNum} occurrences) were primarily caused by ${reason}. ${firstName} agreed to ${action}.`;
  if (commCommitment) {
    durableSummary += ` ${firstName} also agreed to message the household directly if expecting to be more than 10 minutes late.`;
  }
  durableSummary += ` Outcome: ${callOutcome}.`;

  const structuredCategories = {
    ATTENDANCE_HISTORY: `${lateNum} late arrival variance(s) recorded in past 2 weeks.`,
    LATE_ARRIVAL_REASON: reason,
    AGREED_ACTION: action,
    COMMUNICATION_COMMITMENT: commCommitment ? 'Agreed to notify household if >10 min late' : 'No notification commitment',
    RECURRING_CONCERN: reason.includes('bus') ? 'Public transit reliability' : 'Morning scheduling boundary',
    PREVIOUS_CALL_OUTCOME: callOutcome,
    FOLLOW_UP_CONTEXT: `Follow-up check scheduled for ${new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}`
  };

  return {
    durableSummary,
    structuredCategories,
    tags: [
      `helper:${helperId}`,
      `scenario:${scenario || 'coaching'}`,
      `outcome:${callOutcome.replace(/\s+/g, '_')}`
    ],
    metadata: {
      helper_id: helperId,
      helper_name: name,
      date: dateStr,
      late_count: lateNum,
      reason,
      action
    }
  };
}

module.exports = {
  extractDurableMemories,
  sanitizeText
};
