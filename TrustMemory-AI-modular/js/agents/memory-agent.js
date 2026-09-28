/* =========================================================================
   agents/memory-agent.js — Retain / Recall against Hindsight Core
   ========================================================================= */

const NETWORK_META = {
  world: {name:'World Network', desc:'Stable facts written once — who a helper is, what a household needs.'},
  experience: {name:'Experience Network', desc:'Retain writes every event here — attendance, complaints, feedback, calls.'},
  opinion: {name:'Opinion Network', desc:'Where the Decision Agent writes Trust + Churn-risk scores — derived, not absolute.'},
  observation: {name:'Observation Network', desc:'Where the Reflection Agent writes cross-placement patterns after Hindsight Reflect / LLM synthesis.'},
};

function retain(entityId, layer, text, meta){
  if(layer === 'observation' && text && text.trim().toLowerCase() === 'bad') return;
  const m = memOf(entityId);
  m[layer].push({id:uid(), text, meta:meta||{}, t:nowStamp()});
  log('mem','MEMORY AGENT', `Retained ${layer} memory for ${labelFor(entityId)}: "${text}"`);
}

function recall(entityId, note){
  const m = memOf(entityId);
  const count = m.world.length + m.experience.length + m.opinion.length + m.observation.length;
  log('dec','DECISION AGENT', `Recalled ${count} memory entries for ${labelFor(entityId)}${note ? ' — ' + note : ''}.`);
  return m;
}

function globalNetworkCount(layer){
  ensureWorldMemory();
  let n = 0;
  Object.values(MEM).forEach(m => {
    if(m[layer]) n += m[layer].length;
  });
  return n;
}

function ensureWorldMemory(){
  S.helpers.forEach(h => {
    const m = memOf(h.id);
    if(!m.world.length){
      m.world.push({text:`${h.name} has ${h.exp} years of experience.`, t:''});
      m.world.push({text:`Skills: ${h.skills.map(roleLabel).join(', ')}.`, t:''});
      m.world.push({text:`Based in ${h.location}. Availability: ${h.availability}.`, t:''});
    }
    if(!m.opinion.length){
      const best = Object.entries(h.roleScores).sort((a,b)=>b[1]-a[1])[0];
      m.opinion.push({text:`Strong ${roleLabel(best[0])} fit, based on historical placement outcomes.`, t:''});
    }
  });
  S.households.forEach(h => {
    const m = memOf(h.id);
    if(!m.world.length){
      m.world.push({text:`${h.name} is located in ${h.location}.`, t:''});
      m.world.push({text:`Current requirement: ${roleLabel(h.requirement)}. Schedule: ${h.schedule}.`, t:''});
    }
  });

  // Bug (a) fix: Clean any 'bad' observation memories across all entities
  Object.values(MEM).forEach(m => {
    if(m && m.observation){
      m.observation = m.observation.filter(o => o.text && o.text.trim().toLowerCase() !== 'bad');
    }
  });
}
