/* Phase 4 interface: tournament manager & documented game recorder. No AI duel engine. */
(function(root){'use strict';
const C=root.CNRCompetition;
const KEY='cnr-competitions-v1';
let cfg=null,state={tournaments:[],active:'',roster:[],filter:'pending',round:'all',selectedMatch:null,hand:null};
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function message(str){if(cfg?.toast)cfg.toast(str);else alert(str);}
function fail(err){message(err.message||String(err));}
function file(name,body){const b=new Blob([body],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500);}
function read(){try{const o=JSON.parse(localStorage.getItem(KEY)||'{}');if(Array.isArray(o.tournaments)){
 state.tournaments=o.tournaments.slice(0,30).filter(t=>{try{return C.validate(t);}catch{return false;}});
 state.active=state.tournaments.some(t=>t.id===o.active)?o.active:state.tournaments[0]?.id||'';
 }}catch(e){console.warn('Competition storage unreadable',e);}}
function save(){try{localStorage.setItem(KEY,JSON.stringify({version:1,active:state.active,tournaments:state.tournaments}));}catch(e){message('Storage full: export your competition backup before proceeding.');}}
function current(){return state.tournaments.find(t=>t.id===state.active)||null;}
function getTeams(t){return Object.fromEntries(t.participants.map(p=>[p.id,p]));}
function init({getDecks,toast}={}){cfg={getDecks,toast};read();bind();render();}
function render(){roster();renderTop();renderResults();}
function roster(){const list=$('comp-roster');if(!list)return;
 list.innerHTML=state.roster.length?state.roster.map((e,i)=>`<div class="competition-entry"><span class="comp-number">${i+1}</span><div class="comp-entry-name">${esc(e.name)}<small>${e.deck?'Saved deck snapshot':'Name only · decklist not provided'}</small></div><button type="button" class="btn btn-quiet small" data-remove="${i}" aria-label="Remove ${esc(e.name)}">✕</button></div>`).join(''):'<div class="comp-muted">Add two decks to create a match, or load the 24-deck roster to create a tournament.</div>';
 $('comp-roster-count').textContent=`${state.roster.length} / 24 decks`;
 const saved=cfg.getDecks?.()||[],select=$('comp-saved');const previous=select.value;
 select.innerHTML='<option value="">Choose a saved deck…</option>'+saved.map((d,i)=>`<option value="${i}">${esc(d.name)} (${(d.sections?.main||[]).reduce((a,b)=>a+b.qty,0)} main)</option>`).join('');if([...select.options].some(o=>o.value===previous))select.value=previous;
}
function renderTop(){const t=current(),selector=$('comp-selector');selector.innerHTML='<option value="">No competition selected</option>'+state.tournaments.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${x.matches.length} matches)</option>`).join('');selector.value=t?.id||'';
 $('comp-active').hidden=!t; $('comp-placeholder').hidden=!!t; if(!t)return;
 const p=C.progress(t);$('comp-title').textContent=t.name;
 $('comp-subtitle').textContent=`${t.mode==='single'?'Best-of-3 match':'Round-robin'} · ${t.participants.length} entries · names and deck snapshots are frozen at creation`;
 $('comp-progress').style.width=`${p.total?100*p.complete/p.total:0}%`;
 $('comp-progress-label').textContent=`${p.complete} / ${p.total} matches complete`;
 $('comp-progress-caption').textContent=`${p.games} recorded games · ${p.remaining} matches remaining`;
 $('comp-status-tags').innerHTML=`<span class="tag REVIEW">RECORDED RESULTS ONLY</span><span class="tag">${p.withGames} matches started</span><span class="tag">No auto-duels</span>`;
 const attachTeam=$('comp-attach-team'),was=attachTeam.value;
 attachTeam.innerHTML='<option value="">Choose a tournament slot…</option>'+t.participants.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.snapshot?' · list attached':''}</option>`).join('');
 if([...attachTeam.options].some(o=>o.value===was))attachTeam.value=was;
 const saved=cfg.getDecks?.()||[],sel=$('comp-attach-saved'),prev=sel.value;
 sel.innerHTML='<option value="">Choose saved deck…</option>'+saved.map((d,i)=>`<option value="${i}">${esc(d.name)}</option>`).join('');
 if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 $('comp-standings').innerHTML=tableStandings(t);
 const round=$('comp-round');const rounds=Math.max(...t.matches.map(m=>m.round));let prior=state.round;
 round.innerHTML='<option value="all">All rounds</option>'+Array.from({length:rounds},(_,i)=>`<option value="${i+1}">Round ${i+1}</option>`).join('');round.value=[...round.options].some(o=>o.value===prior)?prior:'all';state.round=round.value;
}
function tableStandings(t){const all=C.standings(t),recorded=all.filter(p=>p.played);let html='<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>#</th><th>Deck</th><th>W-L</th><th>Games</th><th>Win %</th></tr></thead><tbody>';
 html+=all.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b><small>${r.points} pts · ${r.gameDiff>=0?'+':''}${r.gameDiff} game diff</small></td><td>${r.wins}–${r.losses}</td><td>${r.gameWins}–${r.gameLosses}</td><td>${r.winRate===null?'—':(r.winRate*100).toFixed(0)+'%'}</td></tr>`).join('')+'</tbody></table></div>';
 return html+`<p class="comp-muted">Ranking: match points (3 per win), then game differential, then game wins. ${recorded.length===0?'No matches recorded yet.':'Small samples have high uncertainty.'} Draws and intentional ties aren't supported.</p>`;
}
function renderResults(){const t=current();if(!t){$('comp-matches').innerHTML='';$('comp-record').innerHTML='';return;}
 const players=getTeams(t);const visible=t.matches.filter(m=>(state.filter==='all'||(state.filter==='complete')===C.score(m).complete)&&(state.round==='all'||Number(state.round)===m.round));
 $('comp-matches').innerHTML=visible.length?visible.map(m=>{const s=C.score(m),label=s.complete?'COMPLETE':m.games.length?'IN PROGRESS':'PENDING';return `<button type="button" class="comp-fixture ${state.selectedMatch===m.id?'chosen':''}" data-match="${esc(m.id)}"><div class="comp-fixture-top"><span>ROUND ${m.round}</span><span class="comp-fixture-state ${s.complete?'done':''}">${label}</span></div><div class="comp-fixture-teams"><span>${esc(players[m.a].name)}</span><strong>${s.a} – ${s.b}</strong><span>${esc(players[m.b].name)}</span></div></button>`;}).join(''):'<div class="comp-muted">No fixtures match those filters.</div>';
 if(!state.selectedMatch||!t.matches.some(m=>m.id===state.selectedMatch)){state.selectedMatch=visible[0]?.id||null;}
 renderMatchDetail(t,players);
}
function renderMatchDetail(t,players){const m=t.matches.find(x=>x.id===state.selectedMatch),root=$('comp-record');if(!m){root.innerHTML='<div class="comp-muted">Select a fixture to record a game or sample opening hands.</div>';return;}
 const a=players[m.a],b=players[m.b],s=C.score(m),next=m.games.length+1;
 let html=`<div class="comp-detail-head"><div><div class="kicker">MATCH ${esc(m.id.toUpperCase())} · ROUND ${m.round}</div><h3>${esc(a.name)} <span>vs.</span> ${esc(b.name)}</h3><p class="comp-muted">${s.complete?'Completed: '+esc(players[s.winner].name)+' won '+s.a+'–'+s.b:'Best-of-3 · game '+next+' is next'}</p></div><span class="tag ${s.complete?'LEGAL':'REVIEW'}">${s.a}–${s.b}</span></div>`;
 if(m.games.length){html+=`<div class="comp-history">${m.games.map((g,i)=>`<div><b>Game ${i+1}:</b> ${esc(players[g.winner].name)} won <span>· First: ${g.first==='unknown'?'not recorded':esc(players[g.first].name)} · ${g.source==='external'?'External simulator / duel':'Manually played'}</span>${g.notes?`<p>${esc(g.notes)}</p>`:''}</div>`).join('')}</div>`;}
 if(!s.complete){html+=`<div class="comp-record-form"><div class="comp-form-grid"><label>Who went first?<select id="comp-first"><option value="unknown">Not recorded</option><option value="${esc(m.a)}">${esc(a.name)}</option><option value="${esc(m.b)}">${esc(b.name)}</option></select></label><label>Evidence source<select id="comp-source"><option value="manual">Manually played duel</option><option value="external">External duel simulator</option></select></label></div><label>Game notes (optional)<textarea id="comp-notes" rows="2" maxlength="500" placeholder="Key interaction, interruption, replay reference…"></textarea></label><p class="comp-muted">Record the winner only after the game has actually been played. No result is calculated or assumed.</p><div class="comp-action-row"><button type="button" class="btn btn-primary" data-win="${esc(m.a)}">${esc(a.name)} won Game ${next}</button><button type="button" class="btn btn-outline" data-win="${esc(m.b)}">${esc(b.name)} won Game ${next}</button></div></div>`;}
 html+=`<div class="comp-action-row"><button type="button" class="btn btn-quiet small" data-undo="${esc(m.id)}" ${m.games.length?'':'disabled'}>↶ Undo last game</button></div>`;
 html+=`<div class="comp-sampler"><div class="comp-detail-head"><div><h3>Opening-hand dealer</h3><p class="comp-muted">Uses stored decklists. No role tagging required. Draws only—does not play a duel.</p></div></div><div class="comp-action-row"><label>Seed<input id="comp-seed" type="number" value="20261022" min="0" max="4294967295"/></label><button type="button" class="btn btn-outline small" data-deal="${esc(m.id)}">Deal 5 cards each</button></div><div id="comp-hand-results"></div></div>`;
 root.innerHTML=html;
}
function bind(){
 $('comp-24').addEventListener('click',()=>{if(state.roster.length&&!confirm('Replace the draft roster with 24 archetype names?'))return;state.roster=C.ROSTER24.map(name=>({name,deck:null,deckId:''}));roster();});
 $('comp-add-name').addEventListener('click',()=>{try{add({name:$('comp-name').value});$('comp-name').value='';}catch(e){fail(e);}});
 $('comp-name').addEventListener('keydown',e=>{if(e.key==='Enter'){$('comp-add-name').click();}});
 $('comp-add-saved').addEventListener('click',()=>{const saved=cfg.getDecks?.()||[],ix=$('comp-saved').value;try{if(ix==='')throw Error('Choose a saved deck');const d=saved[Number(ix)];if(!d)throw Error('Deck not found');add({name:d.name,deck:d,deckId:d.id});}catch(e){fail(e);}});
 $('comp-roster').addEventListener('click',e=>{const b=e.target.closest('button[data-remove]');if(b){state.roster.splice(Number(b.dataset.remove),1);roster();}});
 $('comp-create').addEventListener('click',()=>{try{const t=C.create({name:$('comp-tournament-name').value.trim()||'CNR Format Tournament',mode:$('comp-mode').value,entries:state.roster});if(!confirm(`Create ${t.name} with ${t.matches.length} best-of-3 fixtures? Deck names and snapshots cannot be changed afterward.`))return;
 state.tournaments.unshift(t);if(state.tournaments.length>30)state.tournaments.length=30;state.active=t.id;state.selectedMatch=null;state.roster=[];state.filter='pending';state.round='all';save();render();message('Competition created — record actual games to build standings');}catch(e){fail(e);}});
 $('comp-selector').addEventListener('change',e=>{state.active=e.target.value;state.selectedMatch=null;state.round='all';save();render();});
 $('comp-filter').addEventListener('change',e=>{state.filter=e.target.value;state.selectedMatch=null;renderResults();});
 $('comp-round').addEventListener('change',e=>{state.round=e.target.value;state.selectedMatch=null;renderResults();});
 $('comp-matches').addEventListener('click',e=>{const b=e.target.closest('button[data-match]');if(!b)return;state.selectedMatch=b.dataset.match;renderResults();$('comp-record').scrollIntoView({block:'nearest',behavior:'smooth'});});
 $('comp-record').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const t=current();if(!t)return;
  if(b.dataset.win){try{C.recordGame(t,state.selectedMatch,{winner:b.dataset.win,first:$('comp-first').value,source:$('comp-source').value,notes:$('comp-notes').value});save();renderTop();renderResults();message('Game recorded');}catch(e){fail(e);}}
  else if(b.dataset.undo){try{if(!confirm('Undo the latest game in this match?'))return;C.undoGame(t,state.selectedMatch);save();renderTop();renderResults();}catch(e){fail(e);}}
  else if(b.dataset.deal){try{const draw=C.deal(t,state.selectedMatch,Number($('comp-seed').value)||0,5),m=t.matches.find(x=>x.id===state.selectedMatch),ps=getTeams(t);
   const cardName=key=>{const c=cfg.getCard?.(key);return c?.name||key.replace(/^unknown:/,'Unknown ID ');};
   $('comp-hand-results').innerHTML=`<div class="comp-hand-grid"><div><strong>${esc(ps[m.a].name)}</strong><ol>${draw.a.map(k=>`<li>${esc(cardName(k))}</li>`).join('')}</ol></div><div><strong>${esc(ps[m.b].name)}</strong><ol>${draw.b.map(k=>`<li>${esc(cardName(k))}</li>`).join('')}</ol></div></div><p class="comp-muted">DEALT ONLY · Not a simulated duel. Same seed reproduces these hands for this saved fixture.</p>`;
  }catch(e){fail(e);}}
 });
 $('comp-report').addEventListener('click',()=>{try{const t=current();if(!t)throw Error('Choose a competition first');file('cnrformat-tournament-report.json',JSON.stringify(C.report(t),null,2));message('Tournament report downloaded');}catch(e){fail(e);}});
 $('comp-attach').addEventListener('click' ,()=>{try{const t=current(),id=$('comp-attach-team').value,index=$('comp-attach-saved').value,d=(cfg.getDecks?.()||[])[Number(index)];if(!id||index===''||!d)throw Error('Choose a tournament slot and a saved deck');if(!confirm('Attach "'+d.name+'" to the selected tournament entry? Deck snapshots are frozen once games are recorded.'))return;C.attachDeck(t,id,d);save();renderTop();renderResults();message('Decklist attached — opening-hand dealing is now available');}catch(e){fail(e);}});
 $('comp-export').addEventListener('click' ,()=>{if(!state.tournaments.length){message('Create a competition first');return;}file('cnrformat-phase4-competition-backup.json',JSON.stringify({format:'CNRFormat-Competition-Backup-v1',exportedAt:new Date().toISOString(),tournaments:state.tournaments,active:state.active},null,2));});
 $('comp-import').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>8e6)throw Error('Backup too large (8 MB maximum)');const o=JSON.parse(await f.text());if(o.format!=='CNRFormat-Competition-Backup-v1'||!Array.isArray(o.tournaments)||o.tournaments.length>30)throw Error('Unsupported competition backup');for(const t of o.tournaments)C.validate(t);
 if(!confirm('Replace ALL existing competitions with this backup? Your deck library will not be changed. Download a competition backup first if you need to preserve it.'))return;
 state.tournaments=C.clone(o.tournaments);state.active=state.tournaments.some(x=>x.id===o.active)?o.active:state.tournaments[0]?.id||'';state.selectedMatch=null;state.roster=[];save();render();message('Competition backup restored');}catch(e){fail(e);}finally{e.target.value='';}});
 $('comp-delete').addEventListener('click',()=>{const t=current();if(!t)return;if(!confirm('Delete tournament "'+t.name+'" and ALL recorded results? Export a backup first.'))return;state.tournaments=state.tournaments.filter(x=>x.id!==t.id);state.active=state.tournaments[0]?.id||'';state.selectedMatch=null;save();render();});
}
function add({name,deck=null,deckId=''}={}){name=String(name||'').trim();if(!name)throw Error('Enter a deck name');if(name.length>90)throw Error('Deck name too long');if(state.roster.length>=24)throw Error('Maximum 24 entries');if(state.roster.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw Error('That deck name is already on the roster');state.roster.push({name,deck,deckId});roster();}
root.CNRCompetitionUI={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
