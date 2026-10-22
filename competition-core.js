/* CNRFormat Phase 4 — RESULTS RECORDER, not a Yu-Gi-Oh! duel/rules engine. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CNRCompetition=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FORMAT='CNRFormat-Competition-v1';
const ROSTER24=['Blitzclique','Light and Darkness','RDA Resonantora','Sacred Beast','Swordsoul','Yang Zing','Noble Knight','GMX','P.U.N.K.','Tenpai Dragons','Utopia + Onomat','Purrely','Raidraptor','Exosisters','Zoodiac + Ryzeal','Clowncrew + Runick','Primite + Blue-Eyes','Branded + Dracotail','Magistus + Fairy Tail','Angelechy','Shaddoll + Dracotail','Artmage + Power Patron','Angelechy + Blitzclique','HERO'];
function fail(t){throw new Error(t);}
function safeName(s,max=90){if(typeof s!=='string'||!s.trim()||s.trim().length>max)fail('Enter a valid name (max '+max+' characters)');return s.trim();}
function clone(obj){return JSON.parse(JSON.stringify(obj));}
function safeSnapshot(deck){if(!deck||!deck.sections)return null;const out={};for(const zone of ['main','extra','side']){
 const arr=deck.sections[zone];if(!Array.isArray(arr)||arr.length>160) return null;
 out[zone]=arr.map(c=>({key:String(c.key||'').slice(0,250),qty:Number(c.qty)}));
 if(out[zone].some(c=>!c.key||!Number.isInteger(c.qty)||c.qty<1||c.qty>60))return null;
 }return out;
}
function roundRobin(participants){const n=participants.length,ids=participants.map(p=>p.id);if(n%2)ids.push(null);const N=ids.length,rounds=[];
 for(let r=0;r<N-1;r++){
  const pairs=[];for(let j=0;j<N/2;j++){
    const a=ids[j],b=ids[N-1-j];if(a!=null&&b!=null)pairs.push({a:r%2?b:a,b:r%2?a:b});
  }rounds.push(pairs);ids.splice(1,0,ids.pop());
 }return rounds;
}
function create({name,entries,mode='round_robin',now}={}){
 if(!Array.isArray(entries))fail('Invalid roster');if(!['round_robin','single'].includes(mode))fail('Invalid competition mode');
 if(entries.length<2||entries.length>24||(mode==='single'&&entries.length!==2))fail('Choose '+(mode==='single'?'exactly 2':'2–24')+' decks');
 const names=new Set(),teams=entries.map((item,i)=>{const n=safeName(item.name);if(names.has(n.toLocaleLowerCase()))fail('Duplicate deck name: '+n);names.add(n.toLocaleLowerCase());return {id:'p'+i,name:n,deckId:typeof item.deckId==='string'?item.deckId.slice(0,150):'',snapshot:safeSnapshot(item.deck),note:''};});
 const schedule=mode==='single'?[[{a:'p0',b:'p1'}]]:roundRobin(teams);
 const matches=schedule.flatMap((round,r)=>round.map((pair,i)=>({id:'r'+(r+1)+'m'+(i+1),round:r+1,a:pair.a,b:pair.b,games:[]})));
 const t=now||new Date().toISOString();return {format:FORMAT,id:'t-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:safeName(name||'CNR Tournament',100),mode,createdAt:t,updatedAt:t,participants:teams,matches};
}
function attachDeck(t,participantId,deck){
 const p=t?.participants?.find(x=>x.id===participantId);if(!p)fail('Choose a participant');
 if(t.matches.some(m=>(m.a===participantId||m.b===participantId)&&m.games.length))fail('This deck has already played recorded games; its list is locked for integrity. Create a new tournament if the list changed.');
 const snapshot=safeSnapshot(deck);if(!snapshot||!snapshot.main.length)fail('Saved deck has no valid Main Deck');
 p.snapshot=snapshot;p.deckId=String(deck.id||'').slice(0,150);t.updatedAt=new Date().toISOString();return p;
}
function score(match){const a=match.games.filter(g=>g.winner===match.a).length,b=match.games.filter(g=>g.winner===match.b).length;const winner=a===2?match.a:b===2?match.b:null;return {a,b,winner,complete:!!winner};}
function recordGame(t,matchId,{winner,first='unknown',source='manual',notes=''}={}){
 const m=t?.matches?.find(x=>x.id===matchId);if(!m)fail('Match not found');if(score(m).complete)fail('This match is already completed. Undo a game first.');
 if(![m.a,m.b].includes(winner))fail('Choose which deck won');
 if(![m.a,m.b,'unknown'].includes(first))fail('Invalid first-player selection');
 if(!['manual','external'].includes(source))fail('Invalid evidence type');
 if(typeof notes!=='string'||notes.length>500)fail('Notes must be 500 characters or fewer');
 if(m.games.length>=3)fail('Best-of-three limit reached');
 m.games.push({winner,first,source,notes:notes.trim(),recordedAt:new Date().toISOString()});t.updatedAt=new Date().toISOString();return score(m);
}
function undoGame(t,id){const m=t?.matches?.find(x=>x.id===id);if(!m)fail('Match not found');if(!m.games.length)fail('No recorded games to undo');m.games.pop();t.updatedAt=new Date().toISOString();return score(m);}
function standings(t){const rows=t.participants.map(p=>({id:p.id,name:p.name,played:0,wins:0,losses:0,gameWins:0,gameLosses:0,points:0,winRate:null,gameDiff:0}));const lookup=Object.fromEntries(rows.map(r=>[r.id,r]));
 for(const m of t.matches){const s=score(m);if(!s.complete)continue;const a=lookup[m.a],b=lookup[m.b];if(!a||!b)continue;
 a.played++;b.played++;a.gameWins+=s.a;a.gameLosses+=s.b;b.gameWins+=s.b;b.gameLosses+=s.a;
 if(s.winner===m.a){a.wins++;b.losses++;a.points+=3;}else{b.wins++;a.losses++;b.points+=3;}
 }for(const r of rows){r.winRate=r.played?r.wins/r.played:null;r.gameDiff=r.gameWins-r.gameLosses;}
 rows.sort((a,b)=>b.points-a.points||b.gameDiff-a.gameDiff||b.gameWins-a.gameWins||a.name.localeCompare(b.name));return rows;
}
function progress(t){const complete=t.matches.filter(m=>score(m).complete).length,withGames=t.matches.filter(m=>m.games.length>0).length;return {complete,withGames,total:t.matches.length,games:t.matches.reduce((acc,m)=>acc+m.games.length,0),remaining:t.matches.length-complete};}
function validate(t){
 if(!t||t.format!==FORMAT||!['round_robin','single'].includes(t.mode))fail('Not a CNRFormat Phase 4 competition backup');
 if(!Array.isArray(t.participants)||t.participants.length<2||t.participants.length>24||!Array.isArray(t.matches)||t.matches.length>276)fail('Invalid competition size');
 if(t.mode==='single'&&(t.participants.length!==2||t.matches.length!==1))fail('Invalid single match');
 const ids=new Set(),names=new Set();for(const p of t.participants){if(!p||typeof p.id!=='string'||ids.has(p.id)||!/^p\d+$/.test(p.id))fail('Invalid participant ID');ids.add(p.id);safeName(p.name);if(names.has(p.name.toLowerCase()))fail('Duplicate participant names');names.add(p.name.toLowerCase());if(p.snapshot!==null&&p.snapshot!==undefined&&!safeSnapshot({sections:p.snapshot}))fail('Invalid deck snapshot');}
 if(typeof t.name!=='string'||!t.name.trim()||t.name.length>100)fail('Invalid tournament name');
 const matches=new Set(),pairs=new Set();for(const m of t.matches){if(!m||typeof m.id!=='string'||matches.has(m.id)||!ids.has(m.a)||!ids.has(m.b)||m.a===m.b)fail('Invalid fixture');matches.add(m.id);const pk=[m.a,m.b].sort().join(':');if(pairs.has(pk))fail('Repeated matchup');pairs.add(pk);if(!Number.isInteger(m.round)||m.round<1||m.round>24||!Array.isArray(m.games)||m.games.length>3)fail('Invalid rounds or games');let ac=0,bc=0;for(let i=0;i<m.games.length;i++){const g=m.games[i];if(ac>=2||bc>=2)fail('Games recorded after match finished');if(![m.a,m.b].includes(g.winner)||![m.a,m.b,'unknown'].includes(g.first)||!['manual','external'].includes(g.source)||typeof g.notes!=='string'||g.notes.length>500)fail('Invalid game record');if(g.winner===m.a)ac++;else bc++;}}
 const n=t.participants.length,expected=t.mode==='single'?1:n*(n-1)/2;if(t.matches.length!==expected)fail('Incomplete tournament schedule');return true;
}
function report(t){validate(t);const names=Object.fromEntries(t.participants.map(p=>[p.id,p.name]));return {format:'CNRFormat-Competition-Report-v1',competition:t.name,mode:t.mode,exportedAt:new Date().toISOString(),caution:'RECORDED user/external results only. Not an automated rules-engine simulation. Observed win rates do not imply predictive odds.',progress:progress(t),standings:standings(t).map(r=>({...r,interval95:winInterval(r.wins,r.played)})),matches:t.matches.map(m=>({round:m.round,a:names[m.a],b:names[m.b],score:score(m),winner:score(m).winner?names[score(m).winner]:null,games:m.games.map(g=>({winner:names[g.winner],wentFirst:g.first==='unknown'?'unknown':names[g.first],source:g.source,notes:g.notes,recordedAt:g.recordedAt}))}))};}
function winInterval(wins,n){if(!n)return null;const z=1.96,p=wins/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,rad=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;return {lower:Math.max(0,center-rad),upper:Math.min(1,center+rad)};}
function deal(t,matchId,seed=20261022,handSize=5){const m=t?.matches?.find(x=>x.id===matchId);if(!m)fail('Match not found');if(!Number.isInteger(handSize)||handSize<1||handSize>6)fail('Invalid hand size');
 const pool=id=>{const p=t.participants.find(x=>x.id===id);if(!p?.snapshot?.main?.length)fail(p?.name+': no complete deck snapshot; import a saved deck before creating the tournament.');const a=[];for(const i of p.snapshot.main)for(let j=0;j<i.qty;j++)a.push(i.key);if(a.length<40||a.length>60)fail(p.name+': main deck must have 40–60 cards to deal.');return a;};
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
 const random=s=>{let x=s>>>0;return()=>{x+=0x6D2B79F5;let y=x;y=Math.imul(y^(y>>>15),y|1);y^=y+Math.imul(y^(y>>>7),y|61);return ((y^(y>>>14))>>>0)/4294967296;};};
 const take=(list,rng)=>{const cards=list.slice();for(let j=0;j<handSize;j++){const k=j+Math.floor(rng()*(cards.length-j));[cards[j],cards[k]]=[cards[k],cards[j]];}return cards.slice(0,handSize);};
 const base=String(seed)+'|'+t.id+'|'+m.id;return {a:take(pool(m.a),random(hash(base+'|a'))),b:take(pool(m.b),random(hash(base+'|b'))),seed,handSize,disclaimer:'Sampled opening cards only. NOT an AI duel, combo, interruption, or win-rate simulation.'};
}
return {FORMAT,ROSTER24,create,roundRobin,attachDeck,score,recordGame,undoGame,standings,progress,validate,report,winInterval,deal,clone};
});
