/* CNRFormat v1 — deterministic, browser/Node compatible rules & deck math.
   All verdicts are scoped to the fixed 2026-10-21 CNR snapshot. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.CNRLogic=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFKC').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
  function createIndex(rules){
    const official=new Map(), custom=new Map(), exceptions=new Map(), aliases=new Map();
    for(const [label,n] of [['Forbidden',0],['Limited',1],['Semi-Limited',2]]) for(const name of rules.official_tcg.status_lists[label]) official.set(normalize(name),n);
    for(const name of rules.cnr.forbidden_named) custom.set(normalize(name),0);
    for(const name of rules.cnr.limited_named) custom.set(normalize(name),Math.min(custom.get(normalize(name))??3,1));
    for(const name of rules.cnr.semi_limited_named||[]) custom.set(normalize(name),Math.min(custom.get(normalize(name))??3,2));
    for(const [name,cats] of Object.entries(rules.cnr.category_exceptions)) exceptions.set(normalize(name),cats);
    for(const [alias,name] of Object.entries(rules.aliases||{})) aliases.set(normalize(alias),normalize(name));
    const canonical=s=>aliases.get(normalize(s))||normalize(s);
    return {rules, official, custom, exceptions, aliases, canonical};
  }
  function cardCategories(card){
    const type=String(card?.type||card?.card_type||'').toLowerCase();
    const tags=new Set(card?.categories||[]);
    if(type.includes('link')&&type.includes('monster'))tags.add('link_monster');
    if(type.includes('pendulum'))tags.add('pendulum');
    return [...tags];
  }
  function cardZone(card){
    if(!card)return null;
    const type=String(card.type||card.card_type||'').toLowerCase();
    if(!type) return null;
    if(/(fusion|synchro|xyz|link) monster/.test(type))return 'extra';
    if(type==='skill card'||type==='token')return 'invalid';
    return 'main';
  }
  function checkCard(card,idx){
    if(!card)return {status:'REVIEW',limit:null,reasons:['Card is not present in the catalog'],categories:[]};
    const name=idx.canonical(card.name||''), rules=idx.rules;
    const categories=cardCategories(card), reasons=[];
    let limit=rules.deck.per_card_max, categoryBan=false;
    if(idx.official.has(name)){
      const n=idx.official.get(name);limit=Math.min(limit,n);
      if(n===0) reasons.push('Official TCG Forbidden (October 19, 2026)');
      else if(n<3) reasons.push('Official TCG copy limit: '+n);
    }
    if(idx.custom.has(name)){
      const n=idx.custom.get(name);limit=Math.min(limit,n);
      if(n===0)reasons.push('CNR named ban');
      else if(n<3) reasons.push('CNR named copy limit: '+n);
    }
    const exceptions=idx.exceptions.get(name)||[];
    for(const tag of categories){
      if(rules.cnr.banned_categories.includes(tag)&&!exceptions.includes(tag)){
        limit=0;categoryBan=true;
        reasons.push('CNR category ban: '+tag.replaceAll('_',' '));
      }
    }
    const zone=cardZone(card);
    if(zone==='invalid') {limit=0;reasons.push('Tokens and Skill Cards cannot be placed in this deck');}
    const date=card.tcg_date||card.tcg_release_date;
    if(date && date>rules.card_pool.include_released_through){limit=0;reasons.push('TCG release after ruleset cutoff: '+date);}
    // No card is certified legal on text guesses or missing review metadata.
    const hasId=typeof card.id==='number'&&Number.isInteger(card.id)&&card.id>0;
    const reviewed=card.reviewed===true||card.categories_reviewed===true;
    const knownRelease=card.released===true||card.tcg_released===true||Boolean(date&&date<=rules.card_pool.include_released_through);
    const nonRelease=card.released===false||card.tcg_released===false;
    if(nonRelease){limit=0;reasons.push('Not TCG-released by ruleset cutoff');}
    if(limit===0)return {status:'BANNED',limit:0,reasons,categories,zone};
    const gaps=[];
    if(!reviewed)gaps.push('Hand-trap / Link-related categories not reviewed');
    if(!knownRelease)gaps.push('TCG release eligibility not verified');
    if(!hasId)gaps.push('Official card passcode not verified');
    if(!zone)gaps.push('Deck zone cannot be determined');
    if(gaps.length)return {status:'REVIEW',limit,reasons:[...reasons,...gaps],categories,zone};
    if(!reasons.length)reasons.push('No named or reviewed category restriction');
    return {status:'LEGAL',limit,reasons,categories,zone};
  }
  function newDeck(name='My CNR Deck'){
    return {id:'draft',name,sections:{main:[],extra:[],side:[]},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function cloneDeck(d){return JSON.parse(JSON.stringify(d));}
  function normalizeDeck(d){
    const sections={};
    for(const zone of ['main','extra','side']){
      const arr=d?.sections?.[zone];
      sections[zone]=Array.isArray(arr)?arr.filter(x=>typeof x.key==='string'&&Number.isSafeInteger(x.qty)&&x.qty>0).slice(0,180).map(x=>({key:x.key,qty:Math.min(x.qty,200)})):[];
    }
    return {id:String(d?.id||'draft'),name:String(d?.name||'My CNR Deck').slice(0,120),sections,createdAt:d?.createdAt||new Date().toISOString(),updatedAt:d?.updatedAt||new Date().toISOString()};
  }
  function editQty(deck,zone,key,delta){
    if(!['main','extra','side'].includes(zone))throw Error('Invalid zone');
    const found=deck.sections[zone].find(x=>x.key===key);
    if(!found&&delta>0)deck.sections[zone].push({key,qty:delta});
    if(found){found.qty+=delta;if(found.qty<=0)deck.sections[zone].splice(deck.sections[zone].indexOf(found),1);}
    deck.updatedAt=new Date().toISOString();
    return deck;
  }
  const sectionCount=sec=>(sec||[]).reduce((n,x)=>n+x.qty,0);
  function auditDeck(deck,cards,idx){
    const errors=[],reviews=[],warnings=[],limits=[],totals={};
    const rules=idx.rules;
    for(const z of ['main','extra','side'])totals[z]=sectionCount(deck.sections[z]);
    if(totals.main<rules.deck.main_min||totals.main>rules.deck.main_max)errors.push(`Main Deck has ${totals.main} cards (required ${rules.deck.main_min}–${rules.deck.main_max})`);
    if(totals.extra>rules.deck.extra_max)errors.push(`Extra Deck has ${totals.extra} cards (maximum ${rules.deck.extra_max})`);
    if(totals.side>0)errors.push('CNR does not permit a Side Deck');
    const counts=new Map();
    for(const zone of ['main','extra','side'])for(const item of deck.sections[zone]){
      counts.set(item.key,(counts.get(item.key)||0)+item.qty);
      const card=cards.get(item.key);
      if(!card){reviews.push(`${item.key}: unknown card ID/name — cannot validate`);continue;}
      const verdict=checkCard(card,idx);
      if(verdict.zone==='main'&&zone==='extra'||verdict.zone==='extra'&&zone==='main')errors.push(`${card.name}: wrong zone (${zone}, expected ${verdict.zone})`);
      if(verdict.status==='REVIEW')reviews.push(`${card.name}: ${verdict.reasons.filter(x=>x.includes('not')||x.includes('cannot')||x.includes('missing')||x.includes('review')).join('; ')||'Needs manual verification'}`);
      if(verdict.status==='BANNED')errors.push(`${card.name}: forbidden — ${verdict.reasons.join('; ')}`);
    }
    for(const [key,count] of counts){
      const card=cards.get(key);if(!card)continue;
      const verdict=checkCard(card,idx);
      if(verdict.limit!=null&&count>verdict.limit)errors.push(`${card.name}: ${count} copies, allowed ${verdict.limit}`);
    }
    return {status:errors.length?'ILLEGAL':reviews.length?'REVIEW':'LEGAL',errors:[...new Set(errors)],reviews:[...new Set(reviews)],warnings,totals};
  }
  function idKey(num){return `unknown:${num}`;}
  function nameKey(name){return normalize(name);}
  function bytesFromBase64(s){
    const binary=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');
    return Uint8Array.from(binary, c=>c.charCodeAt(0));
  }
  function base64FromBytes(bytes){
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
    return typeof btoa==='function'?btoa(binary):Buffer.from(binary,'binary').toString('base64');
  }
  function decode32(blob){
    if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(blob))throw Error('Invalid base64');
    const bytes=bytesFromBase64(blob);if(bytes.length%4!==0)throw Error('Malformed YDKE card ID data');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return Array.from({length:bytes.length/4},(_,i)=>view.getUint32(i*4,true));
  }
  function encode32(ids){
    const bytes=new Uint8Array(ids.length*4),view=new DataView(bytes.buffer);
    ids.forEach((n,i)=>view.setUint32(i*4,n,true));return base64FromBytes(bytes);
  }
  function parseDeckText(text){
    const str=String(text||'').trim();let arrs={main:[],extra:[],side:[]};
    if(str.toLowerCase().startsWith('ydke://')){
      const match=str.match(/^ydke:\/\/([^!]*)!([^!]*)!([^!]*)(?:!)?$/i);
      if(!match)throw Error('Invalid YDKE string: expected main!extra!side');
      arrs={main:decode32(match[1]),extra:decode32(match[2]),side:decode32(match[3])};
    }else{
      let zone='main';const lines=str.split(/\r?\n/);
      for(let line of lines){line=line.trim();if(!line||line.toLowerCase().startsWith('#created'))continue;
        if(/^#main\b/i.test(line)) {zone='main';continue;}
        if(/^#extra\b/i.test(line)){zone='extra';continue;}
        if(/^!side\b/i.test(line)){zone='side';continue;}
        if(line.startsWith('#'))continue;
        if(!/^\d{1,10}$/.test(line))throw Error('Unrecognized YDK line: '+line.slice(0,40));
        const id=Number(line);if(!Number.isSafeInteger(id)||id<=0||id>4294967295)throw Error('Invalid passcode '+line);
        arrs[zone].push(id);
      }
    }
    if(Object.values(arrs).reduce((sum,a)=>sum+a.length,0)>500)throw Error('Deck import too large (500 cards maximum)');
    return arrs;
  }
  function deckFromIds(arrs, byId, name='Imported CNR Deck'){
    const d=newDeck(name);
    for(const z of ['main','extra','side'])for(const id of arrs[z]||[]){
      const card=byId.get(id);
      editQty(d,z,card?card.key:idKey(id),1);
    }
    return d;
  }
  function idsFromDeck(deck,cards){
    const result={};
    for(const z of ['main','extra','side']){
      result[z]=[];
      for(const item of deck.sections[z]){
        const card=cards.get(item.key);
        let id=card?.id;
        if(!id&&item.key.startsWith('unknown:'))id=Number(item.key.slice(8));
        if(!Number.isInteger(id)||id<1||id>4294967295)throw Error(`Missing official card passcode: ${card?.name||item.key}. Sync the card database first.`);
        for(let i=0;i<item.qty;i++)result[z].push(id);
      }
    }
    return result;
  }
  function toYDKE(deck,cards){const ids=idsFromDeck(deck,cards);return `ydke://${encode32(ids.main)}!${encode32(ids.extra)}!${encode32(ids.side)}!`;}
  function toYDK(deck,cards){const ids=idsFromDeck(deck,cards);return ['#created by CNRFormat Mobile','#main',...ids.main.map(String),'#extra',...ids.extra.map(String),'!side',...ids.side.map(String),''].join('\n');}
  function pickRelease(card,setDates,cutoff){
    const m=Array.isArray(card.misc_info)?card.misc_info[0]:card.misc_info;
    let date=typeof m?.tcg_date==='string'&&/^\d{4}-\d\d-\d\d/.test(m.tcg_date)?m.tcg_date.slice(0,10):null;
    if(!date){const dates=(card.card_sets||[]).map(s=>setDates.get(s.set_name)).filter(Boolean);if(dates.length)date=dates.sort()[0];}
    return {date,released:date?date<=cutoff:null};
  }
  function apiToCard(raw,annotations,setDates,cutoff){
    if(!raw?.name||!raw?.type)return null;
    const key=nameKey(raw.name),review=annotations.get(key)||{};
    const release=pickRelease(raw,setDates,cutoff);
    return {key,id:Number(raw.id)||null,name:raw.name,type:raw.type,desc:raw.desc||'',archetype:raw.archetype||'',race:raw.race||'',attribute:raw.attribute||'',level:raw.level??null,atk:raw.atk??null,def:raw.def??null,frameType:raw.frameType||'',categories:review.categories||[],reviewed:review.categories_reviewed===true,tcg_date:release.date,released:release.released,source:'YGOPRODeck v7',updatedAt:new Date().toISOString()};
  }
  return {normalize,nameKey,idKey,createIndex,cardCategories,cardZone,checkCard,newDeck,cloneDeck,normalizeDeck,editQty,sectionCount,auditDeck,parseDeckText,deckFromIds,toYDKE,toYDK,idsFromDeck,pickRelease,apiToCard,encode32,decode32};
});
