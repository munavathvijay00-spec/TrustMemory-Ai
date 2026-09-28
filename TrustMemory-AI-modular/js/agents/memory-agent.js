/* =========================================================================
   agents/memory-agent.js — local display cache for memory entries

   The real Memory Agent lives on the server (server/hindsight.js and
   server/retain-queue.js): calls, notes and feedback are retained to the
   Hindsight bank there, and recall happens server side before and during
   every call. This file only keeps the browser's per-entity cache (MEM, see
   memOf() in state.js) in step with what the page just did, so profile pages
   can show it without waiting for the next sync.
   ========================================================================= */

/** Append an entry to the local cache. Does not write to Hindsight. */
function retain(entityId, layer, text, meta){
  const m = memOf(entityId);
  if(!m[layer]) m[layer] = [];
  m[layer].push({id:uid(), text, meta:meta||{}, t:nowStamp()});
}
