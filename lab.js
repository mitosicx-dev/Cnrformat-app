/* CNRFormat Phase 3: offline deterministic consistency laboratory.
 * Statistics depend on MANUAL card-role annotations. No combo/effect simulation.
 * No network calls; compatible with Node.js for reproducible tests.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.CNRLab=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ROLES=['starter','extender','brick','board_breaker','interruption'];
 const label={starter:'Starter',extender:'Extender',brick:'Potential brick',board_breaker:'Board breaker',interruption:'Disruption'};
 function normalizeRoles(input){
  const out={};if(!input||typeof input!=='object'||Array.isArray(input))return out;
  for(const [key,value] of Object.entries(input).slice(0,240)){
   if(typeof key!=='string'||key.length>250||!Array.isArray(value))continue;
   const selected=[...new Set(value.filter(x=>ROLES.includes(x)))];if(selected.length)out[key]=selected;
  }
  return out;
 }
 function mainPool(deck){
  const entries=deck?.sections?.main||[];const pool=[];
  for(const item of entries){
   if(!item||typeof item.key!=='string'||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>200)throw Error('Invalid card quantities');
   for(let i=0;i<item.qty;i++)pool.push(item.key);
  }
  if(pool.length>60)throw Error('Main Deck exceeds 60 cards; fix deck before testing');
  return pool;
 }
 function choose(n,k){
  if(!Number.isSafeInteger(n)||!Number.isSafeInteger(k)||n<0)return 0;
  if(k<0||k>n)return 0;k=Math.min(k,n-k);
  let result=1;for(let i=1;i<=k;i++)result*=((n-i+1)/i);
  return Math.round(result); // small deck sizes and hands (<= 6) stay exactly representable
 }
 function countByRole(pool,roles){
  const counts=Object.fromEntries(ROLES.map(x=>[x,0]));
  for(const key of pool)for(const role of roles[key]||[])if(Object.prototype.hasOwnProperty.call(counts,role))counts[role]++;
  return counts;
 }
 function unionCount(pool,roles,a,b){return pool.reduce((n,key)=>n+((roles[key]||[]).includes(a)||(roles[key]||[]).includes(b)?1:0),0);}
 function probability(deck,handSize=5){
  const pool=mainPool(deck),N=pool.length,roles=normalizeRoles(deck?.analysisRoles);
  if(!Number.isInteger(handSize)||handSize<1||handSize>6)throw Error('Hand size must be 1–6');
  if(N<handSize)throw Error(`Need at least ${handSize} Main Deck cards`);
  const counts=countByRole(pool,roles),total=choose(N,handSize);
  const no=n=>choose(N-n,handSize)/total;
  const s=counts.starter,e=counts.extender,b=counts.brick;
  const metrics={
   starter:1-no(s),
   twoStarters:1-no(s)-s*choose(N-s,handSize-1)/total,
   extender:1-no(e),
   brick:1-no(b),
   starterAndExtender:1-no(s)-no(e)+no(unionCount(pool,roles,'starter','extender')),
   starterNoBrick:no(b)-no(unionCount(pool,roles,'starter','brick')),
   boardBreaker:1-no(counts.board_breaker),
   interruption:1-no(counts.interruption)
  };
  for(const k of Object.keys(metrics))metrics[k]=Math.min(1,Math.max(0,metrics[k]));
  const assigned=pool.reduce((n,key)=>n+((roles[key]||[]).length?1:0),0);
  return {N,handSize,counts,assigned,taggedNames:Object.keys(roles).length,metrics,roles,source:'exact hypergeometric (manual role tags)'};
 }
 function rng(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
 function simulate(deck,{trials=5000,handSize=5,seed=20261022}={}){
  if(!Number.isInteger(trials)||trials<1||trials>50000)throw Error('Trials must be between 1 and 50,000');
  const calc=probability(deck,handSize),pool=mainPool(deck),random=rng(Number(seed)||0),roles=calc.roles;
  const totals={starter:0,twoStarters:0,extender:0,brick:0,starterAndExtender:0,starterNoBrick:0,boardBreaker:0,interruption:0};
  const examples=[],hist=[0,0,0,0,0,0,0];
  for(let trial=0;trial<trials;trial++){
   const work=pool.slice(),hand=[];
   for(let j=0;j<handSize;j++){
    const ix=j+Math.floor(random()*(work.length-j));
    [work[j],work[ix]]=[work[ix],work[j]];
    hand.push(work[j]);
   }
   let ns=0,ne=0,nb=0,breaker=false,interruption=false;
   for(const key of hand){const tags=roles[key]||[];
    if(tags.includes('starter'))ns++;
    if(tags.includes('extender'))ne++;
    if(tags.includes('brick'))nb++;
    if(tags.includes('board_breaker'))breaker=true;
    if(tags.includes('interruption'))interruption=true;
   }
   if(ns>0)totals.starter++;
   if(ns>=2)totals.twoStarters++;
   if(ne>0)totals.extender++;
   if(nb>0)totals.brick++;
   if(ns>0&&ne>0)totals.starterAndExtender++;
   if(ns>0&&nb===0)totals.starterNoBrick++;
   if(breaker)totals.boardBreaker++;
   if(interruption)totals.interruption++;
   hist[Math.min(ns,6)]++;
   if(examples.length<5)examples.push({cards:hand,starter:ns,extender:ne,brick:nb});
  }
  const observed=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/trials]));
  const confidence=Object.fromEntries(Object.entries(observed).map(([k,p])=>[k,1.96*Math.sqrt(p*(1-p)/trials)]));
  return {trials,seed:Number(seed)||0,handSize,exact:calc,observed,confidence,examples,hist};
 }
 function whatIfStarter(deck,handSize=5,max=3){
  const base=probability(deck,handSize),neutral=base.N-base.counts.starter;
  // Hypothetical: replace non-starters with standalone starters, size unchanged.
  return Array.from({length:Math.min(max,neutral)+1},(_,delta)=>{
   const S=base.counts.starter+delta;
   return {delta,starterCount:S,probability:1-choose(base.N-S,handSize)/choose(base.N,handSize)};
  });
 }
 function compare(a,b,handSize=5){
  const first=probability(a,handSize),second=probability(b,handSize);
  return {first,second,difference:Object.fromEntries(Object.keys(first.metrics).map(k=>[k,second.metrics[k]-first.metrics[k]]))};
 }
 return {ROLES,label,normalizeRoles,mainPool,choose,countByRole,probability,simulate,whatIfStarter,compare};
});
