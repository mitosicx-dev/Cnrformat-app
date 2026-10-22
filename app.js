/* CNRFormat Mobile v1.0 — offline-first single-page deck builder. */
(async function(){
 'use strict';
 const L=window.CNRLogic, Lab=window.CNRLab;
 const $=id=>document.getElementById(id);
 const state={rules:null,idx:null,cards:new Map(),byId:new Map(),all:[],annotations:new Map(),deck:L.newDeck(),library:[],view:'discover',query:'',type:'all',status:'all',sort:'name',page:0,pageSize:54,lastVersion:'',syncing:false,activeCard:null,labHand:5,labTrials:5000,labSeed:20261022,labResult:null,compareA:'draft',compareB:''};
 const sanitize=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const storage=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}};
 function persist(){try{localStorage.setItem('cnr-current-v1',JSON.stringify(state.deck));}catch(e){toast('Could not save deck locally — storage may be full');}}
 function saveLibrary(){try{localStorage.setItem('cnr-library-v1',JSON.stringify(state.library));}catch(e){toast('Could not save library — storage may be full');}}
 let timer;
 function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,3800);}
 const number=n=>new Intl.NumberFormat('en-US').format(n||0);
 function getCard(key){return state.cards.get(key)||null;}
 function details(key){const card=getCard(key);if(card)return card;if(key.startsWith('unknown:'))return {key,name:`Unknown ID ${key.slice(8)}`,id:Number(key.slice(8)),type:'Unknown',desc:'This passcode has not yet been resolved. Sync the full card database.'};return {key,name:key,type:'Unknown',desc:'Card not in this catalog.'};}
 function enrichSeed(seed){return (seed.cards||[]).map(c=>({key:L.nameKey(c.name),id:null,name:c.name,type:c.card_type||'',desc:'',archetype:'',categories:c.categories||[],reviewed:c.categories_reviewed===true,tcg_date:null,released:c.tcg_released===true,source:'Phase 1 reviewed seed'}));}
 function indexCards(list){state.cards=new Map(list.map(c=>[c.key,c]));state.all=Array.from(state.cards.values()).sort((a,b)=>a.name.localeCompare(b.name));state.byId=new Map();for(const c of state.all)if(Number.isInteger(c.id)&&c.id>0)state.byId.set(c.id,c);repairImportedUnknowns();}
 function repairImportedUnknowns(){const decks=[state.deck,...state.library];let touched=false;
 for(const d of decks)for(const z of ['main','extra','side'])for(const item of d.sections[z]){
  if(!item.key.startsWith('unknown:'))continue;
  const known=state.byId.get(Number(item.key.slice(8)));if(known){item.key=known.key;touched=true;}
 }
 for(const d of decks)for(const z of ['main','extra','side']){
  const merged=new Map();for(const i of d.sections[z])merged.set(i.key,(merged.get(i.key)||0)+i.qty);
  d.sections[z]=[...merged].map(([key,qty])=>({key,qty}));
 }
 if(touched){persist();saveLibrary();}
 }
 function view(name){state.view=name;for(const el of document.querySelectorAll('.view'))el.classList.toggle('active',el.id==='view-'+name);
 for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(name==='builder')renderBuilder();if(name==='library')renderLibrary();if(name==='discover')renderCatalog();if(name==='rules')renderSyncDetails();if(name==='lab')renderLab();window.scrollTo({top:0,behavior:'instant'});
 }
 function verdictClass(v){return v==='LEGAL'?'status-good':v==='BANNED'||v==='ILLEGAL'?'status-bad':'status-review';}
 function showStats(){const audit=L.auditDeck(state.deck,state.cards,state.idx);$('stat-cards').textContent=number(state.all.length);
 $('stat-source').textContent=state.all.length<100?'Starter preview · sync needed':'Locally cached cards';
 $('stat-total').innerHTML=`${audit.totals.main} <small>/ 40 min</small>`;
 $('stat-deck').textContent=`${audit.totals.extra} extra · ${audit.totals.side} side`;
 const el=$('stat-legality');el.className=verdictClass(audit.status);el.textContent=audit.status;
 }
 function pct(x){return `${(100*x).toFixed(2)}%`;}
 function setLabRoles(key,role){
  if(!state.deck.analysisRoles||typeof state.deck.analysisRoles!=='object')state.deck.analysisRoles={};
  const old=new Set(state.deck.analysisRoles[key]||[]);
  if(old.has(role))old.delete(role);else old.add(role);
  if(old.size)state.deck.analysisRoles[key]=[...old];else delete state.deck.analysisRoles[key];
  state.labResult=null;state.deck.updatedAt=new Date().toISOString();persist();renderLab();
 }
 function renderLab(){
  const deck=state.deck,main=deck.sections.main||[],roles=Lab.normalizeRoles(deck.analysisRoles);
  let pool;
  try{pool=Lab.mainPool(deck);}catch(e){
   $('lab-size').textContent='—';$('lab-tagged').textContent='—';$('lab-starters').textContent='—';
   $('lab-roles').innerHTML=`<div class="empty-state">${sanitize(e.message)}. Fix the Main Deck in Deck Builder.</div>`;
   $('lab-metrics').innerHTML='';$('lab-whatif').innerHTML='';$('lab-sim-results').innerHTML='';renderCompareSelectors();return;
  }
  const tagged=pool.filter(k=>(roles[k]||[]).length>0).length;
  $('lab-size').textContent=pool.length;$('lab-tagged').textContent=tagged;$('lab-starters').textContent=pool.filter(k=>(roles[k]||[]).includes('starter')).length;
  $('lab-roles').innerHTML=main.length?main.map(item=>{
   const c=details(item.key),selected=roles[item.key]||[];
   return `<div class="role-row"><div class="role-name">${sanitize(c.name)}<small>×${item.qty} · ${sanitize(c.type||'Unknown type')}</small></div><div class="role-buttons">${Lab.ROLES.map(role=>`<button type="button" class="role-btn" data-role="${role}" data-key="${sanitize(item.key)}" aria-pressed="${selected.includes(role)}">${sanitize(Lab.label[role])}</button>`).join('')}</div></div>`;
  }).join(''):'<div class="empty-state">Add cards in Deck Builder, then return here to assign their roles.</div>';
  $('lab-hand').value=String(state.labHand);$('lab-trials').value=String(state.labTrials);$('lab-seed').value=String(state.labSeed);
  let calc;
  try{calc=Lab.probability(deck,state.labHand);}catch(e){$('lab-metrics').innerHTML=`<div class="empty-state">${sanitize(e.message)}</div>`;$('lab-whatif').innerHTML='<div class="lab-help">Fill the Main Deck before running what-if tests.</div>';$('lab-sim-results').innerHTML='';renderCompareSelectors();return;}
  const measures=[
   ['starter','At least 1 starter','Chance to see any manually tagged starter'],
   ['twoStarters','At least 2 starters','Two or more cards tagged as starters'],
   ['starterAndExtender','Starter + extender','At least one of each tag, allowing overlap'],
   ['starterNoBrick','Starter, no tagged brick','At least one starter and zero potential-brick tags'],
   ['brick','At least 1 potential brick','Having a tagged brick does not prove the hand is unplayable'],
   ['boardBreaker','At least 1 board breaker','Tagged board-breaking card drawn'],
   ['interruption','At least 1 disruption','Tagged interruption drawn']
  ];
  $('lab-metrics').innerHTML=measures.map(([key,name,desc])=>`<div class="lab-metric"><label>${name}</label><strong>${pct(calc.metrics[key])}</strong><small>${desc}</small><div class="lab-bar"><span style="width:${Math.min(100,100*calc.metrics[key])}%"></span></div></div>`).join('');
  const options=Lab.whatIfStarter(deck,state.labHand,3);
  $('lab-whatif').innerHTML=`<table class="lab-table"><thead><tr><th>Hypothetical substitution</th><th>Starters</th><th>Chance</th><th>Change</th></tr></thead><tbody>${options.map(x=>`<tr><td>${x.delta===0?'Current deck':`+${x.delta} starter ${x.delta===1?'copy':'copies'}`}</td><td>${x.starterCount}</td><td>${pct(x.probability)}</td><td>${x.delta===0?'—':`+${(100*(x.probability-options[0].probability)).toFixed(2)} pp`}</td></tr>`).join('')}</tbody></table>`;
  if(calc.counts.starter===0)$('lab-sim-results').innerHTML='<p class="lab-help">Tag at least one starter to make consistency results meaningful. You may still simulate random hands with no tags.</p>';
  else if(!state.labResult)$('lab-sim-results').innerHTML='<p class="lab-help">Ready. Tap “Simulate opening hands” to generate sample hands with your selected random seed.</p>';
  else renderLabSample(state.labResult);
  renderCompareSelectors();
 }
 function renderLabSample(result){
  const s=result,calc=s.exact;
  const names=key=>sanitize(details(key).name);
  const sample=s.examples.map((h,i)=>`<div class="hand-sample"><div><b>Hand ${i+1}</b> · ${h.starter} starters · ${h.extender} extenders · ${h.brick} potential bricks</div><div class="hand-cards">${h.cards.map(key=>{const tags=(calc.roles[key]||[]);return `<span class="hand-chip ${tags.includes('starter')?'starter':tags.includes('brick')?'brick':''}">${names(key)}</span>`;}).join('')}</div></div>`).join('');
  const ci=100*s.confidence.starter;
  $('lab-sim-results').innerHTML=`<h4>SAMPLED · ${s.trials.toLocaleString()} hands</h4><p>Seed ${s.seed} · ${s.handSize} cards each. Starter drawn in <b>${pct(s.observed.starter)}</b> of samples versus <b>${pct(calc.metrics.starter)}</b> calculated exactly. Approximate 95% Monte Carlo margin: ±${ci.toFixed(2)} percentage points.</p><div class="hand-list">${sample}</div><p>These hands are raw draws, not validated combos. Reusing the same seed and deck reproduces the same examples.</p>`;
 }
 function labDeck(id){return id==='draft'?state.deck:state.library.find(d=>d.id===id)||null;}
 function renderCompareSelectors(){
  const options=[{id:'draft',name:`Current draft — ${state.deck.name}`},...state.library.map(d=>({id:d.id,name:`${d.name} · ${new Date(d.updatedAt).toLocaleDateString()}`}))];
  if(!options.some(x=>x.id===state.compareA))state.compareA='draft';
  if(!options.some(x=>x.id===state.compareB))state.compareB=options.length>1?options[1].id:'draft';
  const values=options.map(d=>`<option value="${sanitize(d.id)}">${sanitize(d.name)}</option>`).join('');
  $('lab-compare-a').innerHTML=values;$('lab-compare-b').innerHTML=values;
  $('lab-compare-a').value=state.compareA;$('lab-compare-b').value=state.compareB;
  renderCompare();
 }
 function renderCompare(){
  const a=labDeck(state.compareA),b=labDeck(state.compareB);
  if(!a||!b){$('lab-compare').innerHTML='<div class="lab-help">Select valid deck versions.</div>';return;}
  try{
   const data=Lab.compare(a,b,state.labHand);const metrics=[['starter','≥1 Starter'],['twoStarters','≥2 Starters'],['starterAndExtender','Starter + extender'],['starterNoBrick','Starter, no brick'],['brick','≥1 tagged brick']];
   const va=L.auditDeck(a,state.cards,state.idx).status,vb=L.auditDeck(b,state.cards,state.idx).status;
   $('lab-compare').innerHTML=`<table class="lab-table"><thead><tr><th>Exact ${state.labHand}-card probability</th><th>A · ${sanitize(va)}</th><th>B · ${sanitize(vb)}</th></tr></thead><tbody>${metrics.map(([k,label])=>`<tr><td>${label}</td><td>${pct(data.first.metrics[k])}</td><td>${pct(data.second.metrics[k])}</td></tr>`).join('')}</tbody></table><p class="lab-help">Tags: A ${data.first.assigned}/${data.first.N} copies; B ${data.second.assigned}/${data.second.N} copies. Both decks must be tagged consistently. ${va!=='LEGAL'||vb!=='LEGAL'?'At least one deck is not verified LEGAL; these are still raw draw statistics.':''} Higher starter probability alone does not establish a stronger deck.</p>`;
  }catch(e){$('lab-compare').innerHTML=`<div class="lab-help">${sanitize(e.message)}. Complete both decklists before comparing.</div>`;}
 }
 function labReport(){
  const calc=Lab.probability(state.deck,state.labHand),audit=L.auditDeck(state.deck,state.cards,state.idx);
  return {format:'CNRFormat-Phase3-Analysis-v1',date:new Date().toISOString(),deckName:state.deck.name,ruleset:state.rules.ruleset_id,legalityStatus:audit.status,legalityErrors:audit.errors,reviewItems:audit.reviews,deckSize:calc.N,handSize:state.labHand,manuallyAssignedRoles:calc.roles,taggedCardCopies:calc.assigned,roleCopies:calc.counts,exactProbabilities:calc.metrics,simulation:state.labResult?{trials:state.labResult.trials,seed:state.labResult.seed,handSize:state.labResult.handSize,observed:state.labResult.observed,confidence:state.labResult.confidence,examples:state.labResult.examples}:null,disclaimer:'Probabilities describe tagged cards drawn. No combo, interaction, disruption, or win-rate testing was performed.'};
 }
 function cardFace(c){const kind=String(c.type||'').toLowerCase();const t=kind.includes('spell')?'spell':kind.includes('trap')?'trap':L.cardZone(c)==='extra'?'extra':'';
 const monogram=c.name?.split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase()||'?';
 return `<div class="card-face ${t}" aria-hidden="true"><div class="face-title">${sanitize(c.name||'CARD')}</div><div class="face-art"><b>${sanitize(monogram)}</b></div><div class="face-desc"></div></div>`;}
 function renderCatalog(){const q=state.query.trim().toLowerCase();const filtered=state.all.filter(c=>{
  if(q&&!`${c.name} ${c.archetype||''} ${c.desc||''} ${c.type||''}`.toLowerCase().includes(q))return false;
  const t=String(c.type||'').toLowerCase();if(state.type==='monster'&&!t.includes('monster'))return false;if(state.type==='spell'&&!t.includes('spell'))return false;if(state.type==='trap'&&!t.includes('trap'))return false;
  return state.status==='all'||L.checkCard(c,state.idx).status===state.status;
 });
 if(state.sort==='archetype')filtered.sort((a,b)=>(a.archetype||'ZZZ').localeCompare(b.archetype||'ZZZ')||a.name.localeCompare(b.name));
 const shown=filtered.slice(0,(state.page+1)*state.pageSize);
 $('results-caption').textContent=`Showing ${number(shown.length)} of ${number(filtered.length)} cards`;
 $('catalog-notice').textContent=state.all.length<100?'17-card seed · full sync in Settings':'Local searchable snapshot';
 $('card-results').innerHTML=shown.length?shown.map(c=>{
  const status=L.checkCard(c,state.idx);const z=L.cardZone(c);
  return `<article class="card-item" data-open="${sanitize(c.key)}" tabindex="0" role="button" aria-label="View ${sanitize(c.name)} details">${cardFace(c)}<div class="card-info"><div class="card-name">${sanitize(c.name)}</div><div class="card-type">${sanitize(c.archetype||c.type||'Unclassified')}</div><div class="card-meta"><span class="tag ${status.status}">${status.status==='REVIEW'?'REVIEW':status.status==='BANNED'?'BANNED':'LEGAL'}</span><span class="tag">${z==='extra'?'EXTRA':z==='main'?'MAIN':'UNKNOWN'}</span></div></div><div class="card-actions"><button class="mini-btn" data-add="${sanitize(c.key)}" aria-label="Add ${sanitize(c.name)}" title="Add to deck">+</button><button class="mini-btn" data-more="${sanitize(c.key)}" aria-label="Details for ${sanitize(c.name)}">⌕</button></div></article>`;
 }).join(''):`<div class="empty-state"><strong>No cards found</strong>${state.all.length<100?'Sync the full database in Settings to search all cards.':'Try another card name, effect or filter.'}</div>`;
 $('show-more').hidden=shown.length>=filtered.length;
 }
 function addCard(key,zone){const c=getCard(key);if(!c){toast('Card not found');return;}const z=zone||L.cardZone(c);
 if(z!=='main'&&z!=='extra'){toast('Card type cannot be placed in the deck');return;}
 L.editQty(state.deck,z,key,1);state.labResult=null;persist();showStats();if(state.view==='builder')renderBuilder();toast(`${c.name} added to ${z} deck`);
 }
 function showCard(key){const c=details(key),v=L.checkCard(getCard(key),state.idx);const z=L.cardZone(c);
 $('modal-body').innerHTML=`<div class="modal-detail">${cardFace(c)}<div><h2 class="modal-name" id="modal-title">${sanitize(c.name)}</h2><div class="card-meta"><span class="tag ${v.status}">${v.status}</span><span class="tag">MAX ${v.limit===null?'?':v.limit}</span></div><p>${sanitize(c.type||'Unknown type')}${c.archetype?'<br>Archetype: '+sanitize(c.archetype):''}${c.attribute?' · '+sanitize(c.attribute):''}</p>${c.atk!==null&&c.atk!==undefined?`<p>ATK ${sanitize(c.atk)} ${c.def!==null&&c.def!==undefined?' / DEF '+sanitize(c.def):''}</p>`:''}</div></div>
 <div class="kicker">CARD EFFECT</div><div class="effect-box">${sanitize(c.desc||'Full card text unavailable in the seed preview. Sync the card database to populate effects.')}</div><div class="kicker" style="margin-top:16px">CNR VERDICT</div><div class="effect-box">${v.reasons.map(s=>'• '+sanitize(s)).join('\n')}\n\nRelease: ${sanitize(c.tcg_date||'Unknown')} · Classification: ${c.reviewed?'Reviewed':'Review needed'}</div><div class="modal-actions">${z==='main'||z==='extra'?`<button class="btn btn-primary" data-add="${sanitize(key)}">+ Add to ${z==='main'?'Main':'Extra'} Deck</button>`:''}<button class="btn btn-outline" data-modal-close="1">Close</button></div>`;
 state.activeCard=key;$('card-modal').hidden=false;document.body.style.overflow='hidden';$('modal-close').focus();
 }
 function closeModal(){$('card-modal').hidden=true;document.body.style.overflow='';state.activeCard=null;}
 function renderBuilder(){const a=L.auditDeck(state.deck,state.cards,state.idx);
 $('deck-name').value=state.deck.name;
 const pane=$('audit-panel');pane.className='audit-panel '+a.status.toLowerCase();
 const headline=a.status==='LEGAL'?'✓ Validated for this ruleset':a.status==='ILLEGAL'?'✕ Deck is not CNR legal':'⚠ Review required before claiming legality';
 let issues=[...a.errors.slice(0,8),...a.reviews.slice(0,7)];if(a.errors.length+a.reviews.length>issues.length)issues.push('…and more issues');
 pane.innerHTML=`<h3>${headline}</h3><p>${a.totals.main} main · ${a.totals.extra} extra · ${a.totals.side} side. ${a.errors.length} errors, ${a.reviews.length} review items.</p>${issues.length?`<ul>${issues.map(s=>`<li>${sanitize(s)}</li>`).join('')}</ul>`:'<p>All structural, restriction, release and classification checks passed for these records.</p>'}`;
 for(const z of ['main','extra','side']){
  const list=state.deck.sections[z];$('zone-'+z).innerHTML=list.length?list.map(item=>{
   const c=details(item.key),v=L.checkCard(getCard(item.key),state.idx);
   return `<div class="zone-card"><span class="qty-pill">×${item.qty}</span><span class="zone-title">${sanitize(c.name)}</span><span class="zone-state ${verdictClass(v.status)}">${v.status}</span><div class="qty-ctrls"><button data-minus="${sanitize(item.key)}" data-zone="${z}" title="Remove one" aria-label="Remove one ${sanitize(c.name)}">−</button><button data-plus="${sanitize(item.key)}" data-zone="${z}" title="Add one" aria-label="Add one ${sanitize(c.name)}">+</button></div></div>`;
  }).join(''):'<div class="zone-empty">No cards yet — add cards from the database.</div>';
 }
 $('main-count').textContent=`${a.totals.main} / 40–60`;$('extra-count').textContent=`${a.totals.extra} / 20`;$('side-count').textContent=`${a.totals.side} / 0`;$('side-wrap').hidden=a.totals.side===0;
 }
 function renderLibrary(){const area=$('saved-decks');if(!state.library.length){area.innerHTML='<div class="empty-state"><strong>No saved deck versions</strong>Build a deck, select “Save version”, and it will appear here.</div>';return;}
 area.innerHTML=state.library.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>{
 const a=L.auditDeck(d,state.cards,state.idx);
 return `<article class="saved-card"><div class="saved-date">${sanitize(new Date(d.updatedAt).toLocaleDateString())}</div><h3>${sanitize(d.name)}</h3><p>${a.totals.main} main · ${a.totals.extra} extra · ${a.totals.side} side</p><div class="card-meta"><span class="tag ${a.status==='ILLEGAL'?'BANNED':a.status}">${a.status}</span></div><div class="action-wrap"><button class="btn btn-primary small" data-load="${sanitize(d.id)}">Open deck</button><button class="btn btn-outline small" data-delete="${sanitize(d.id)}">Delete</button></div></article>`;
 }).join('');}
 function renderSyncDetails(){const meta=storage('cnr-sync-meta-v1',{});$('sync-details').textContent=meta.updatedAt?`${number(state.all.length)} cached cards. Last sync: ${new Date(meta.updatedAt).toLocaleString()}. Source: ${meta.source||'YGOPRODeck v7'}. This does not automatically update CNR restrictions.`:'Starter preview only. Select Sync database to download the full card feed. The feed and card artwork are separate.';$('rule-version').textContent=`Ruleset ${state.rules.ruleset_id} · card eligibility through ${state.rules.card_pool.include_released_through}`;}
 async function hydrateCatalog(){const saved=await CNRStore.getAll();indexCards(saved);showStats();renderCatalog();renderSyncDetails();}
 function makeAnnotations(seed){for(const c of seed.cards||[])state.annotations.set(L.nameKey(c.name),c);}
 async function boot(){try{
  const [rResp,sResp]=await Promise.all([fetch('./cnr_rules.json'),fetch('./catalog_seed.json')]);if(!rResp.ok||!sResp.ok)throw Error('Cannot load bundled rules');
  state.rules=await rResp.json();const seed=await sResp.json();state.idx=L.createIndex(state.rules);makeAnnotations(seed);
  state.deck=L.normalizeDeck(storage('cnr-current-v1',L.newDeck()));state.library=(storage('cnr-library-v1',[])||[]).slice(0,250).map(L.normalizeDeck);
  await CNRStore.open();if(await CNRStore.count()===0)await CNRStore.putMany(enrichSeed(seed));await hydrateCatalog();
  initEvents();$('online-text').textContent=navigator.onLine?'Online · offline-ready':'Offline mode';registerSW();
 }catch(e){console.error(e);$('results-caption').textContent='Failed to load app';$('card-results').innerHTML=`<div class="empty-state"><strong>App needs a web server</strong>Open this via GitHub Pages or localhost, not a direct file:// link. ${sanitize(e.message)}</div>`;}}
 function initEvents(){document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
 let typing; $('card-search').addEventListener('input',e=>{clearTimeout(typing);typing=setTimeout(()=>{state.query=e.target.value;state.page=0;renderCatalog();},180);});
 for(const [id,prop] of [['filter-type','type'],['filter-status','status'],['filter-sort','sort']])$(id).addEventListener('change',e=>{state[prop]=e.target.value;state.page=0;renderCatalog();});
 $('show-more').addEventListener('click',()=>{state.page++;renderCatalog();});
 $('card-results').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.add){e.stopPropagation();addCard(b.dataset.add);return;}if(b?.dataset.more){e.stopPropagation();showCard(b.dataset.more);return;}const box=e.target.closest('[data-open]');if(box)showCard(box.dataset.open);});
 $('card-results').addEventListener('keydown',e=>{if(e.target.matches('[data-open]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();showCard(e.target.dataset.open);}});
 $('modal-body').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.add){addCard(b.dataset.add);closeModal();}else if(b.dataset.modalClose)closeModal();});
 $('modal-close').addEventListener('click',closeModal);$('card-modal').addEventListener('click',e=>{if(e.target.id==='card-modal')closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('card-modal').hidden)closeModal();});
 $('lab-go-builder').addEventListener('click',()=>view('builder'));
 $('lab-roles').addEventListener('click',e=>{const b=e.target.closest('button[data-role]');if(b&&Lab.ROLES.includes(b.dataset.role))setLabRoles(b.dataset.key,b.dataset.role);});
 $('lab-hand').addEventListener('change',e=>{state.labHand=Number(e.target.value);state.labResult=null;renderLab();});
 $('lab-trials').addEventListener('change',e=>{state.labTrials=Number(e.target.value);state.labResult=null;renderLab();});
 $('lab-seed').addEventListener('change',e=>{state.labSeed=Math.max(0,Math.min(4294967295,Number(e.target.value)||0));state.labResult=null;renderLab();});
 $('lab-simulate').addEventListener('click',()=>{try{state.labResult=Lab.simulate(state.deck,{handSize:state.labHand,trials:state.labTrials,seed:state.labSeed});renderLabSample(state.labResult);toast(`Simulated ${state.labTrials.toLocaleString()} hands`);}catch(err){toast(err.message);}});
 $('lab-export').addEventListener('click',()=>{try{download(`${safeFilename(state.deck.name)}_lab.json`,JSON.stringify(labReport(),null,2),'application/json');toast('Lab report downloaded');}catch(err){toast(err.message);}});
 $('lab-compare-a').addEventListener('change',e=>{state.compareA=e.target.value;renderCompare();});
 $('lab-compare-b').addEventListener('change',e=>{state.compareB=e.target.value;renderCompare();});
 $('builder-find').addEventListener('click',()=>view('discover'));$('deck-name').addEventListener('input',e=>{state.deck.name=e.target.value.slice(0,120);persist();});
 $('new-deck').addEventListener('click',()=>{if(!confirm('Start a new draft? Your current draft will be replaced. Use Save version first if you want to keep it.'))return;state.deck=L.newDeck();state.labResult=null;persist();showStats();renderBuilder();});
 $('save-deck').addEventListener('click',()=>{const d=L.cloneDeck(state.deck);d.id=String(Date.now())+'-'+Math.random().toString(36).slice(2,8);d.updatedAt=new Date().toISOString();state.library.push(d);saveLibrary();toast('Saved a new deck version');});
 for(const zone of ['main','extra','side'])$('zone-'+zone).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const key=b.dataset.plus||b.dataset.minus;L.editQty(state.deck,zone,key,b.dataset.plus?1:-1);state.labResult=null;persist();showStats();renderBuilder();});
 $('saved-decks').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.load){const d=state.library.find(x=>x.id===b.dataset.load);if(!d)return;state.deck=L.cloneDeck(d);state.deck.id='draft';state.labResult=null;persist();showStats();view('builder');toast('Saved deck loaded as editable draft');}else if(b.dataset.delete){if(!confirm('Delete this saved version?'))return;state.library=state.library.filter(x=>x.id!==b.dataset.delete);saveLibrary();renderLibrary();}});
 $('import-paste').addEventListener('click',()=>importText($('import-text').value));$('ydk-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await importText(await f.text());}finally{e.target.value='';}});
 $('copy-ydke').addEventListener('click',async()=>{try{const str=L.toYDKE(state.deck,state.cards);if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(str);else{$('import-text').value=str;$('import-text').select();document.execCommand('copy');}toast('YDKE copied');}catch(e){toast(e.message);}});
 $('download-ydk').addEventListener('click',()=>{try{download(`${safeFilename(state.deck.name)}.ydk`,L.toYDK(state.deck,state.cards),'text/plain');toast('YDK downloaded');}catch(e){toast(e.message);}});
 $('backup-export').addEventListener('click',()=>download('cnrformat-deck-backup.json',JSON.stringify({format:'CNRFormat-Mobile-Backup-v1',saved:state.library,current:state.deck,exportedAt:new Date().toISOString()},null,2),'application/json'));
 $('backup-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>5e6)throw Error('Backup too large');const obj=JSON.parse(await f.text());if(obj.format!=='CNRFormat-Mobile-Backup-v1'||!Array.isArray(obj.saved))throw Error('Unsupported backup');if(!confirm('Replace saved decks and current draft with this backup?'))return;state.library=obj.saved.slice(0,250).map(L.normalizeDeck);state.deck=L.normalizeDeck(obj.current||L.newDeck());state.labResult=null;saveLibrary();persist();showStats();renderLibrary();toast('Backup restored');}catch(err){toast(err.message);}finally{e.target.value='';}});
 $('sync-full').addEventListener('click',()=>syncOnline());$('sync-shortcut').addEventListener('click',()=>{view('rules');syncOnline();});$('file-import-json').addEventListener('click',()=>$('api-file').click());$('api-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>100e6)throw Error('JSON file too large');await importApi(JSON.parse(await f.text()),null,'Imported JSON snapshot');}catch(err){toast('Import failed: '+err.message);}finally{e.target.value='';}});
 $('clear-data').addEventListener('click',async()=>{if(!confirm('Clear the full card database on this phone? Saved decks will remain, but cards may show as unknown until synced again.'))return;await CNRStore.clear();const resp=await fetch('./catalog_seed.json');const seed=await resp.json();await CNRStore.putMany(enrichSeed(seed));localStorage.removeItem('cnr-sync-meta-v1');await hydrateCatalog();toast('Database reset to starter cards');});
 window.addEventListener('online',()=>{$('online-text').textContent='Online · offline-ready';});window.addEventListener('offline',()=>{$('online-text').textContent='Offline mode';});
 }
 function safeFilename(s){return String(s).replace(/[^a-z0-9_-]+/gi,'_').slice(0,55)||'cnr_deck';}
 function download(name,body,type){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
 async function importText(value){try{if(!value.trim())throw Error('Paste a YDK list or YDKE link first');const ids=L.parseDeckText(value);if(!confirm('Replace the current draft with the imported deck?'))return;state.deck=L.deckFromIds(ids,state.byId,'Imported CNR Deck');state.labResult=null;persist();showStats();view('builder');toast('Deck imported — check the legality report');}catch(e){toast('Import failed: '+e.message);}}
 function setSync(text,fraction){$('sync-track').hidden=false;$('sync-details').textContent=text;$('sync-fill').style.width=`${Math.max(0,Math.min(100,Math.round((fraction||0)*100)))}%`;}
 async function importApi(payload,setCatalog,source){const list=Array.isArray(payload)?payload:payload?.data;
  if(!Array.isArray(list)||list.length<10)throw Error('Expected an API response containing at least 10 cards');
  const dates=new Map((Array.isArray(setCatalog)?setCatalog:[]).filter(x=>x?.set_name&&/^\d{4}-\d\d-\d\d/.test(x.tcg_date||'')).map(x=>[x.set_name,x.tcg_date.slice(0,10)]));
  setSync(`Processing ${number(list.length)} cards…`,.2);
  const cards=list.map(raw=>L.apiToCard(raw,state.annotations,dates,state.rules.card_pool.include_released_through)).filter(Boolean);
  if(cards.length!==list.length)throw Error('API returned malformed card records; import canceled');
  if(cards.length<1000 && source==='YGOPRODeck v7 live sync')throw Error('Unexpectedly small API response; import canceled');
  setSync(`Storing ${number(cards.length)} cards in offline database…`,.3);
  await CNRStore.putMany(cards,(done,total)=>setSync(`Saving cards ${number(done)} / ${number(total)}…`,.3+.65*done/total));
  localStorage.setItem('cnr-sync-meta-v1',JSON.stringify({source,updatedAt:new Date().toISOString(),count:cards.length}));
  await hydrateCatalog();renderBuilder();setSync(`✓ Synced ${number(cards.length)} cards. Classification review remains necessary.`,1);toast(`Cached ${number(cards.length)} cards for offline use`);
 }
 async function syncOnline(){if(state.syncing)return;if(!navigator.onLine){toast('Connect to the internet to sync');return;}
 state.syncing=true;$('sync-full').disabled=true;
 try{setSync('Checking YGOPRODeck card feed…',.03);
  let payload=null,sets=null,source='YGOPRODeck v7 live sync';
  try{
    const resp=await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php',{cache:'no-store'});
    if(!resp.ok)throw Error(`Card feed returned HTTP ${resp.status}`);
    setSync('Downloading full card information…',.1);payload=await resp.json();
    try{setSync('Checking TCG release dates…',.18);const r=await fetch('https://db.ygoprodeck.com/api/v7/cardsets.php',{cache:'no-store'});if(r.ok)sets=await r.json();}catch(e){console.warn('Set metadata unavailable',e);}
  }catch(externalError){
    console.warn('Direct API unavailable, trying published same-origin snapshot:',externalError);
    setSync('Direct API unavailable — trying site-hosted card snapshot…',.1);
    const resp=await fetch('./card_snapshot.json',{cache:'no-store'});
    if(!resp.ok)throw Error('Neither the live API nor the site-hosted snapshot is available');
    const snapshot=await resp.json();payload=snapshot;sets=snapshot.sets||null;source='GitHub Pages weekly card snapshot';
  }
  await importApi(payload,sets,source);
 }catch(e){console.error('Sync error',e);setSync(`Sync failed: ${e.message}. Existing card data was preserved. If your network blocks requests, import a downloaded cardinfo.php JSON file.`,0);toast('Sync failed; see details');}
 finally{state.syncing=false;$('sync-full').disabled=false;}
 }
 function registerSW(){if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline worker unavailable',e));}
 let deferredPrompt;
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('install-btn').hidden=false;});
 $('install-btn').addEventListener('click',async()=>{if(!deferredPrompt){toast('Use Chrome menu → Add to Home screen');return;}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('install-btn').hidden=true;});
 await boot();
})();
