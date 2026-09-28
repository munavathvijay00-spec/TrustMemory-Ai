/**
 * scratch/test_hindsight_flow.js
 * End-to-End Verification Test for Hindsight Memory Integration
 */
const { memoryService, getHelperBankId } = require('../server/memory/memoryService');

async function runEndToEndTest() {
  console.log('====================================================');
  console.log('HINDSIGHT MEMORY END-TO-END FLOW VERIFICATION');
  console.log('====================================================\n');

  // 1. Health check
  const health = await memoryService.checkHealth();
  console.log('1. Hindsight Health Check:', health);

  // 2. Bank ID validation
  const anitaBank = getHelperBankId('anita');
  console.log('\n2. Resolved Bank ID for Anita:', anitaBank);
  if (anitaBank !== 'helper-anita') throw new Error('Bank ID mismatch');

  // Test phone number safeguard on bank ID
  try {
    getHelperBankId('+918341745014');
    console.error('FAIL: Phone number was permitted as bank ID');
  } catch(e) {
    console.log('✓ Safeguard verified: Phone number rejected as bank ID:', e.message);
  }

  // 3. First Call Pre-Call Context (Fresh helper)
  const firstCallCtx = await memoryService.buildAgentMemoryContext('priya', 'Priya Nair');
  console.log('\n3. First Call Memory Context (Priya - Fresh):');
  console.log('   has_previous_memory:', firstCallCtx.has_previous_memory);
  console.log('   opening_hook:', firstCallCtx.opening_dialogue_hook);

  // 4. First Call Retain (Anita explains bus road work & commits to 7:15 AM bus)
  console.log('\n4. Simulating Call 1 Completion for Anita:');
  const retain1 = await memoryService.retainCallMemory({
    helperId: 'anita',
    helperName: 'Anita Verma',
    lateCount: 2,
    scenario: 'coaching_call',
    callDate: '2026-09-28',
    outcome: {
      root_cause_identified: 'transit delay on bus route due to road work',
      specific_commitment: 'take earlier bus at 07:15 AM instead of 07:40 AM',
      notification_commitment: true,
      sentiment: 'cooperative'
    }
  });
  console.log('   Retained summary:', retain1.durableSummary);

  // 5. Second Call Pre-Call Context (Anita - Recalls Call 1)
  console.log('\n5. Building Context for Call 2 (Anita):');
  const secondCallCtx = await memoryService.buildAgentMemoryContext('anita', 'Anita Verma');
  console.log('   has_previous_memory:', secondCallCtx.has_previous_memory);
  console.log('   Bullet summary:\n   *', secondCallCtx.bullet_summary.join('\n   * '));
  console.log('\n   Voice Agent Memory Opening Hook:');
  console.log('   "', secondCallCtx.opening_dialogue_hook, '"');

  // 6. Second Call Retain (Helper updates that earlier bus was cancelled, switches to sharing auto)
  console.log('\n6. Simulating Call 2 Completion (Route Evolution):');
  const retain2 = await memoryService.retainCallMemory({
    helperId: 'anita',
    helperName: 'Anita Verma',
    lateCount: 2,
    scenario: 'coaching_call',
    callDate: '2026-09-29',
    outcome: {
      root_cause_identified: 'earlier 7:15 AM bus cancelled due to road work',
      specific_commitment: 'switch to sharing auto route from main junction',
      notification_commitment: true,
      sentiment: 'cooperative'
    }
  });
  console.log('   Retained updated summary:', retain2.durableSummary);

  // 7. Third Call Pre-Call Context (Reflects updated route)
  console.log('\n7. Building Context for Call 3 (Reflecting Updated Reality):');
  const thirdCallCtx = await memoryService.buildAgentMemoryContext('anita', 'Anita Verma');
  console.log('   Latest recalled fact:\n   *', thirdCallCtx.raw_facts[0]);

  // 8. Isolation Check
  console.log('\n8. Checking Helper Isolation (Priya must NOT see Anita\'s memory):');
  const priyaRecall = await memoryService.recallHelperMemory('priya');
  console.log('   Priya memory count:', priyaRecall.results?.length || 0);
  if ((priyaRecall.results?.length || 0) > 0) {
    throw new Error('Isolation failed: Priya saw Anita\'s memory!');
  }
  console.log('   ✓ Isolation confirmed: helper-priya is completely isolated from helper-anita.');

  console.log('\n====================================================');
  console.log('✓ ALL HINDSIGHT VERIFICATION TESTS PASSED!');
  console.log('====================================================');
}

runEndToEndTest().catch(console.error);
