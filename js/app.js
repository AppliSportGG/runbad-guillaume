/* =========================================================================
   Run&Bad Guillaume — app.js
   Carnet d'entraînement personnel : course à pied, renforcement, badminton.

   Sommaire :
     1. Store            — persistance locale (localStorage)
     2. Bibliothèque      — types de séances (LIB), éditable
     3. Dates & semaines  — helpers de calendrier
     4. État global
     5. Chargement / sauvegarde
     6. Statistiques (bilan d'une semaine, agrégat toutes semaines)
     7. Google Agenda
     8. Formulaire de fin de séance (réutilisé Accueil + Semaine)
     9. Écran Accueil ("Aujourd'hui")
    10. Écran Semaine
    11. Bibliothèque (gestion CRUD)
    12. Ma progression
    13. Carnet (journal hebdo + historique complet)
    14. Statut du sportif
    15. Statistiques globales
    16. Records
    17. Paramètres
    18. Données (export / import JSON)
    19. Navigation (onglets + menu "Plus")
    20. Démarrage
   ========================================================================= */

/* ------------------------------------------------------------------------
   1. STORE — persistance locale, robuste, qui fonctionne hors connexion
      (interface volontairement proche de l'API "storage" d'un artefact :
      get() lève une erreur si la clé n'existe pas, comme un vrai backend).
   ------------------------------------------------------------------------ */
const Store = {
  async get(key){
    const raw = localStorage.getItem('rb:'+key);
    if(raw===null) throw new Error('missing key: '+key);
    return { key, value: raw };
  },
  async set(key, value){
    localStorage.setItem('rb:'+key, value);
    return { key, value };
  },
  async delete(key){
    localStorage.removeItem('rb:'+key);
    return { key, deleted:true };
  },
  async list(prefix){
    const keys = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('rb:')){
        const real = k.slice(3);
        if(!prefix || real.startsWith(prefix)) keys.push(real);
      }
    }
    return { keys };
  }
};

/* ------------------------------------------------------------------------
   2. BIBLIOTHÈQUE DE SÉANCES
   ------------------------------------------------------------------------ */
const DEFAULT_LIB = {
  REPOS:{ name:"Repos", tier:"gray", color:"var(--gray)", intensity:0, duree:0, suunto:"—",
    objectif:"Récupération complète.", watch:"Profite du repos, hydrate-toi bien." },
  SL1:{ name:"Sortie longue", tier:"green", color:"var(--green)", intensity:5, duree:105, suunto:"SL1 - Endurance",
    objectif:"Développer le foncier.", watch:"Allure conversationnelle, ne pas dériver en tempo.", cible:"160–168 bpm" },
  I1:{ name:"Fractionné — 10×1'", tier:"red", color:"var(--red)", intensity:9, duree:40, suunto:"I1 - 10x1",
    objectif:"VO₂ max / cardio.", watch:"Répétitions franches, récupération complète en trot.", cible:"RPE 8,5–9/10" },
  T1:{ name:"Tempo — 8×2'", tier:"orange", color:"var(--orange)", intensity:8, duree:50, suunto:"T1 - 8x2",
    objectif:"Travail au seuil.", watch:"Rester régulier, ne pas exploser en fin de séance.", cible:"RPE 8/10" },
  T2:{ name:"Tempo longue — 5×4'", tier:"orange", color:"var(--orange)", intensity:7.5, duree:70, suunto:"T2 - 5x4",
    objectif:"Tenir une allure élevée, seuil long.", watch:"Rester relâché des épaules, foulée fluide.", cible:"170–178 bpm" },
  C1:{ name:"Côtes", tier:"red", color:"var(--red)", intensity:8.5, duree:45, suunto:"C1 - Côtes",
    objectif:"Puissance (côte 5–8%).", watch:"Technique avant vitesse : buste droit, poussée active.", cible:"Effort max contrôlé sur 40s" },
  F1:{ name:"Fartlek", tier:"orange", color:"var(--orange)", intensity:6.5, duree:40, suunto:"— (non programmée)",
    objectif:"Plaisir, jeu d'allures libre.", watch:"Se faire plaisir, varier selon l'envie du moment.", cible:"Libre" },
  R1:{ name:"Footing récup", tier:"green", color:"var(--green)", intensity:3, duree:45, suunto:"R1 - Récup",
    objectif:"Récupération active.", watch:"Rester sous 150 bpm, aucune notion de vitesse.", cible:"< 150 bpm" },
  REN:{ name:"Renforcement", tier:"blue", color:"var(--blue)", intensity:6, duree:15, suunto:"— (hors montre)",
    objectif:"Stabilité du tronc, gainage et tonicité générale.", watch:"Qualité d'exécution avant quantité.", cible:"Circuit habituel" },
};
let LIB = JSON.parse(JSON.stringify(DEFAULT_LIB));
function getSessionDef(key){
  return LIB[key] || { name:"Séance supprimée", tier:"gray", color:"var(--gray)", intensity:0, duree:0, suunto:"—",
    objectif:"Ce type de séance n'existe plus dans la bibliothèque.", watch:"", cible:"—" };
}
const TIER_LABELS = { green:"🟢 Endurance", orange:"🟠 Tempo", red:"🔴 Fractionné", blue:"🔵 Renforcement" };
const RUNNING_TYPES = ["SL1","I1","T1","T2","C1","F1","R1"];

/* ------------------------------------------------------------------------
   3. DATES & SEMAINES
   Règle stricte : tout est calculé en heure LOCALE du téléphone.
   Aucun appel à toISOString() / getUTCDay() / Date.UTC() n'est utilisé
   pour identifier "quel jour on est" — uniquement getFullYear/getMonth/
   getDate/getDay, qui reflètent toujours le calendrier local de l'appareil.
   ------------------------------------------------------------------------ */
const DAY_NAMES = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"]; // index 0 = Lundi
const MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MONTHS_FULL = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

/** Nom du jour local (Lundi..Dimanche) à partir de Date.getDay() (0=Dimanche..6=Samedi). */
function dayNameLocal(d){ return DAY_NAMES[(d.getDay()+6)%7]; }

/** Clé "AAAA-MM-JJ" en heure locale — jamais de conversion UTC ici. */
function isoDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

/** Lundi de la semaine locale contenant d. 0=dimanche,1=lundi,...,6=samedi (standard JS). */
function getMonday(d){
  const date=new Date(d.getFullYear(), d.getMonth(), d.getDate()); // minuit local, sans heure/minute résiduelle
  const day=date.getDay(); // 0=dimanche .. 6=samedi
  const diff=(day===0 ? -6 : 1-day); // ramène toujours au lundi de la semaine
  date.setDate(date.getDate()+diff);
  return date;
}
function fmtDate(d){ return d.getDate()+" "+MONTHS[d.getMonth()]; }
/** Affichage complet type "Samedi 1 août 2026", en heure locale. */
function fmtFullDate(d){ return `${dayNameLocal(d)} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`; }

function weekDatesFor(m){ return Array.from({length:7},(_,i)=>{ const d=new Date(m.getFullYear(), m.getMonth(), m.getDate()); d.setDate(d.getDate()+i); return d; }); }
function keyForMonday(m){ return "plan:"+isoDate(m); }

/** Numéro de semaine ISO-8601, calculé entièrement en local (aucun getUTC*). */
function isoWeekNumber(d){
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = (date.getDay()+6)%7; // 0=lundi..6=dimanche
  date.setDate(date.getDate() - dayNum + 3); // jeudi de cette semaine-là
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay()+6)%7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  return 1 + Math.round((date - firstThursday) / 86400000 / 7);
}
function emptyDay(session){ return { session, done:false, plaisir:null, rpe:null, fatigue:null, distance:null, notes:"" }; }

const today = new Date();
const monday = getMonday(today);
const weekDates = weekDatesFor(monday);
const weekKey = keyForMonday(monday);
const todayISO = isoDate(today);
const weekNum = isoWeekNumber(today);

/* ------------------------------------------------------------------------
   4. ÉTAT GLOBAL
   ------------------------------------------------------------------------ */
let plan = {};                 // semaine réelle en cours (référence directe dans weekCache)
let viewedMonday = new Date(monday);
let weekCache = {};
let progression = { vo2:5, endurance:5, gainage:5, force:5 };
let statut = { forme:"green", recuperation:"green", charge:"yellow", motivation:"green" };
let journalCurrent = { objectif:"", commentaires:"", plaisir:"", decision:"" };
let journalHistoryLoaded = false;
let settings = { nom:"", fcMax:"", fcRepos:"", vfc:"", objectifs:"" };
let recordsManual = { meilleur10km:"", fcReposMin:"", vfcMax:"", recordGainage:"", recordPompes:"" };

function setStatusLine(t){ const el=document.getElementById('statusLine'); if(el) el.textContent = t; }

/* ------------------------------------------------------------------------
   5. CHARGEMENT / SAUVEGARDE
   ------------------------------------------------------------------------ */
const SUGGESTED_DEFAULT = ["REPOS","REPOS","REPOS","REN","REPOS","SL1","REPOS"]; // Lun -> Dim

async function ensureWeekLoaded(m){
  const key = keyForMonday(m);
  if(weekCache[key]) return weekCache[key];
  let p;
  try{ const r = await Store.get(key); p = JSON.parse(r.value); }catch(e){ p = {}; }
  weekDatesFor(m).forEach((d,i)=>{
    const k = isoDate(d);
    if(!p[k]) p[k] = emptyDay(key===weekKey ? SUGGESTED_DEFAULT[i] : "REPOS");
  });
  weekCache[key] = p;
  return p;
}
async function saveWeekAt(m){
  const key = keyForMonday(m);
  setStatusLine("enregistrement…");
  try{ await Store.set(key, JSON.stringify(weekCache[key])); setStatusLine("à jour"); }
  catch(e){ setStatusLine("erreur d'enregistrement"); }
}
async function savePlan(){ await saveWeekAt(monday); }
async function saveLibrary(){ try{ await Store.set('library-custom', JSON.stringify(LIB)); }catch(e){} }
async function saveProgression(){ try{ await Store.set('progression', JSON.stringify(progression)); }catch(e){} }
async function saveStatut(){ try{ await Store.set('statut', JSON.stringify(statut)); }catch(e){} }
async function saveJournalCurrent(){
  try{ await Store.set('journal:'+weekKey, JSON.stringify(journalCurrent)); setStatusLine("carnet enregistré"); }
  catch(e){ setStatusLine("erreur d'enregistrement"); }
}
async function saveSettings(){ try{ await Store.set('settings', JSON.stringify(settings)); setStatusLine("paramètres enregistrés"); }catch(e){} }
async function saveRecordsManual(){ try{ await Store.set('records-manual', JSON.stringify(recordsManual)); setStatusLine("records enregistrés"); }catch(e){} }

async function loadAll(){
  try{ const r = await Store.get('library-custom'); LIB = JSON.parse(r.value); }catch(e){}
  try{ const r = await Store.get(weekKey); plan = JSON.parse(r.value); }catch(e){ plan = {}; }
  weekDates.forEach((d,i)=>{ const k=isoDate(d); if(!plan[k]) plan[k]=emptyDay(SUGGESTED_DEFAULT[i]); });
  weekCache[weekKey] = plan;

  try{ const r = await Store.get('progression'); progression = JSON.parse(r.value); }catch(e){}
  try{ const r = await Store.get('statut'); statut = JSON.parse(r.value); }catch(e){}
  try{ const r = await Store.get('journal:'+weekKey); journalCurrent = JSON.parse(r.value); }catch(e){}
  try{ const r = await Store.get('settings'); settings = JSON.parse(r.value); }catch(e){}
  try{ const r = await Store.get('records-manual'); recordsManual = JSON.parse(r.value); }catch(e){}
}

/** Parcourt toutes les semaines connues (déjà sauvegardées + en mémoire). */
async function scanAllWeeks(){
  let keys = [];
  try{ const r = await Store.list('plan:'); keys = r.keys; }catch(e){}
  const keySet = new Set(keys);
  Object.keys(weekCache).forEach(k=>keySet.add(k));
  const weeks = [];
  for(const k of keySet){
    let p = weekCache[k];
    if(!p){
      try{ const r = await Store.get(k); p = JSON.parse(r.value); }catch(e){ p = {}; }
      weekCache[k] = p;
    }
    const m = new Date(k.replace('plan:','')+'T00:00:00');
    weeks.push({ key:k, monday:m, dates:weekDatesFor(m), plan:p });
  }
  weeks.sort((a,b)=> b.key.localeCompare(a.key));
  return weeks;
}

/* ------------------------------------------------------------------------
   6. STATISTIQUES
   ------------------------------------------------------------------------ */
function computeStatsFor(wplan, wdates){
  let done=0,total=0,km=0,renMin=0,charge=0,plaisirSum=0,plaisirCount=0;
  wdates.forEach(d=>{
    const k=isoDate(d); const e=wplan[k]; if(!e) return;
    if(e.session!=="REPOS") total++;
    if(e.done){
      done++;
      const s=getSessionDef(e.session);
      const rpe = (typeof e.rpe==="number") ? e.rpe : s.intensity;
      charge += rpe * (s.duree/60);
      if(e.session==="REN") renMin += 15;
      if(typeof e.distance==="number") km += e.distance;
      if(typeof e.plaisir==="number"){ plaisirSum+=e.plaisir; plaisirCount++; }
    }
  });
  return { done, total, km: Math.round(km*10)/10, renMin, charge: Math.round(charge),
    plaisirAvg: plaisirCount? Math.round((plaisirSum/plaisirCount)*10)/10 : null };
}
function computeStats(){ return computeStatsFor(plan, weekDates); }
function bilanRowHTML(stats){
  return `
    <div class="dash-item"><div class="dash-val">${stats.done}/${stats.total}</div><div class="dash-label">séances faites</div></div>
    <div class="dash-item"><div class="dash-val">${stats.km || "—"}${stats.km?" km":""}</div><div class="dash-label">distance</div></div>
    <div class="dash-item"><div class="dash-val">${stats.renMin} min</div><div class="dash-label">renforcement</div></div>
    <div class="dash-item"><div class="dash-val">${stats.charge}</div><div class="dash-label">charge (indicative)</div></div>
    <div class="dash-item"><div class="dash-val">${stats.plaisirAvg ?? "—"}</div><div class="dash-label">plaisir moyen</div></div>
  `;
}

/* ------------------------------------------------------------------------
   7. GOOGLE AGENDA
   ------------------------------------------------------------------------ */
function pad(n){ return n<10 ? '0'+n : ''+n; }
function gcalUrl(dateISO, key){
  const s = getSessionDef(key);
  const d = new Date(dateISO+'T00:00:00');
  const isWeekend = d.getDay()===0 || d.getDay()===6;
  const hour = isWeekend ? 9 : 18;
  const start = new Date(d); start.setHours(hour,0,0,0);
  const end = new Date(start.getTime() + (s.duree||30)*60000);
  const fmt = dt => dt.getFullYear()+pad(dt.getMonth()+1)+pad(dt.getDate())+'T'+pad(dt.getHours())+pad(dt.getMinutes())+'00';
  const text = encodeURIComponent(`${key} — ${s.name}`);
  const details = encodeURIComponent(`Objectif : ${s.objectif}\nÀ surveiller : ${s.watch}\nCible : ${s.cible||'—'}\nSuunto : ${s.suunto}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}&ctz=Europe/Paris`;
}

/* ------------------------------------------------------------------------
   8. FORMULAIRE DE FIN DE SÉANCE
   ------------------------------------------------------------------------ */
function logFormHTML(planObj, k){
  const e = planObj[k];
  const showDist = RUNNING_TYPES.includes(e.session);
  return `
    <div class="log-form ${e.done?'done':''}" data-logkey="${k}">
      <div class="log-title">${e.done ? "Séance enregistrée" : "Fin de séance"}</div>
      <div class="log-fields">
        <div class="log-field"><label>Plaisir <span class="val" data-out="plaisir">${e.plaisir??5}/10</span></label>
          <input type="range" min="0" max="10" value="${e.plaisir??5}" data-field="plaisir"></div>
        <div class="log-field"><label>RPE (difficulté ressentie) <span class="val" data-out="rpe">${e.rpe??5}/10</span></label>
          <input type="range" min="0" max="10" value="${e.rpe??5}" data-field="rpe"></div>
        <div class="log-field"><label>Fatigue musculaire <span class="val" data-out="fatigue">${e.fatigue??5}/10</span></label>
          <input type="range" min="0" max="10" value="${e.fatigue??5}" data-field="fatigue"></div>
        ${showDist ? `<div class="log-field"><label>Distance (km, optionnel)</label>
          <input type="number" step="0.1" min="0" placeholder="ex: 18.5" value="${e.distance??''}" data-field="distance"></div>` : ``}
        <div class="log-field"><label>Notes</label>
          <textarea data-field="notes" placeholder="Sensations, contexte, météo…">${e.notes||''}</textarea></div>
      </div>
      <div class="log-actions">
        ${e.done
          ? `<span class="done-flag">✓ Fait</span><button class="btn small" data-unmark="${k}">Annuler</button>`
          : `<button class="btn primary" data-mark="${k}">✔ Séance réalisée — enregistrer</button>`}
      </div>
    </div>
  `;
}
function bindLogForm(container, planObj, onSaved){
  container.querySelectorAll('input[type=range]').forEach(r=>{
    r.addEventListener('input', e=>{
      const wrap = e.target.closest('.log-form');
      const out = wrap.querySelector(`[data-out="${e.target.dataset.field}"]`);
      if(out) out.textContent = e.target.value + "/10";
    });
  });
  container.querySelectorAll('[data-mark]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      const k = e.target.dataset.mark;
      const wrap = e.target.closest('.log-form');
      wrap.querySelectorAll('[data-field]').forEach(f=>{
        let v;
        if(f.dataset.field==="distance") v = f.value===""?null:parseFloat(f.value);
        else if(f.dataset.field==="notes") v = f.value;
        else v = parseInt(f.value,10);
        planObj[k][f.dataset.field] = v;
      });
      planObj[k].done = true;
      await onSaved();
    });
  });
  container.querySelectorAll('[data-unmark]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      const k = e.target.dataset.unmark;
      planObj[k].done = false;
      await onSaved();
    });
  });
}

/* ------------------------------------------------------------------------
   9. ÉCRAN ACCUEIL — "AUJOURD'HUI"
   ------------------------------------------------------------------------ */
function renderToday(){
  const box = document.getElementById('todayContent');
  const bilanBox = document.getElementById('todayBilan');
  bilanBox.innerHTML = `<div class="dash-title">Résumé de la semaine</div><div class="dash-row">${bilanRowHTML(computeStats())}</div>`;

  const inWeek = weekDates.some(d=>isoDate(d)===todayISO);
  const k = todayISO;
  if(!inWeek || !plan[k]){
    box.innerHTML = `<div class="today-empty">Pas de séance programmée pour aujourd'hui.</div>`;
    return;
  }
  const e = plan[k]; const s = getSessionDef(e.session);
  const dayLabel = DAY_NAMES[weekDates.findIndex(d=>isoDate(d)===k)];

  if(e.session==="REPOS"){
    box.innerHTML = `
      <div class="today-card">
        <div class="today-badge"><span class="dot" style="background:var(--gray)"></span>${dayLabel} — Repos</div>
        <div class="today-block">${s.watch}</div>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="today-card">
      <div class="today-badge"><span class="dot" style="background:${s.color}"></span>${dayLabel} — ${s.name}</div>
      <div class="today-row">
        <div class="today-stat">⏱ <b>${s.duree} min</b></div>
        <div class="today-stat">🎯 <b>${s.cible||"—"}</b></div>
      </div>
      <div class="today-block"><b>Objectif :</b> ${s.objectif}</div>

      <div id="todayExpand" style="${e.done ? '' : 'display:none;'}">
        <div class="today-block" style="border-top:1px dashed var(--line);margin-top:12px;padding-top:12px;">
          <div><b>À surveiller :</b> ${s.watch}</div>
          <div style="margin-top:4px;"><b>Suunto :</b> ${s.suunto.startsWith('—') ? 'Aucune séance à lancer sur la montre' : s.suunto}</div>
          <div style="margin-top:10px;"><a class="btn small" target="_blank" rel="noopener" href="${gcalUrl(k,e.session)}">+ Google Agenda</a></div>
        </div>
        ${logFormHTML(plan, k)}
      </div>

      ${e.done ? '' : `<button class="start-btn" id="startBtn">Démarrer la séance</button>`}
    </div>
  `;
  if(!e.done){
    document.getElementById('startBtn').addEventListener('click', ()=>{
      document.getElementById('todayExpand').style.display = 'block';
      document.getElementById('startBtn').style.display = 'none';
    });
  }
  bindLogForm(box, plan, async ()=>{ await savePlan(); renderAll(); });
}

/* ------------------------------------------------------------------------
   10. ÉCRAN SEMAINE
   ------------------------------------------------------------------------ */
async function renderWeek(){
  const key = keyForMonday(viewedMonday);
  const wplan = await ensureWeekLoaded(viewedMonday);
  const wdates = weekDatesFor(viewedMonday);
  const isCurrent = key === weekKey;

  document.getElementById('weekNavLabel').innerHTML =
    `Semaine ${isoWeekNumber(wdates[0])} · ${fmtDate(wdates[0])} → ${fmtDate(wdates[6])}${isCurrent ? ' <span class="cur-tag">· actuelle</span>' : ''}`;
  document.getElementById('jumpTodayWrap').style.display = isCurrent ? 'none' : 'block';

  document.getElementById('weekBilan').innerHTML = `
    <div class="dash-title">Bilan de cette semaine</div>
    <div class="dash-row">${bilanRowHTML(computeStatsFor(wplan, wdates))}</div>
  `;

  const grid = document.getElementById('weekGrid');
  grid.innerHTML = wdates.map((d,i)=>{
    const k = isoDate(d); const e = wplan[k]; const s = getSessionDef(e.session);
    const isToday = k===todayISO;
    return `
      <div class="day-row ${isToday?'is-today':''} ${e.done && e.session!=='REPOS' ?'is-done':''}">
        <div class="day-row-head">
          <span class="day-row-name">${DAY_NAMES[i]}</span>
          <span class="day-row-date">${fmtDate(d)}</span>
          <select class="day-select" data-date="${k}">
            ${Object.keys(LIB).map(key2=>`<option value="${key2}" ${key2===e.session?'selected':''}>${key2==='REPOS'?'Repos':key2+' — '+LIB[key2].name}</option>`).join('')}
          </select>
          ${e.session!=='REPOS' ? `<a class="btn small" target="_blank" rel="noopener" href="${gcalUrl(k,e.session)}" title="Ajouter à Google Agenda">📅</a>` : ``}
          ${e.session!=='REPOS' ? `<button class="btn small" data-toggledetail="${k}"><span class="done-check">${e.done?'✓':'⋯'}</span></button>` : ``}
        </div>
        ${e.session!=='REPOS' ? `<div class="day-row-detail" id="detail-${k}">${logFormHTML(wplan,k)}</div>` : ``}
      </div>
    `;
  }).join('');

  const persistAndRefresh = async ()=>{
    await saveWeekAt(viewedMonday);
    if(isCurrent){ renderToday(); }
    renderWeek();
  };

  grid.querySelectorAll('.day-select').forEach(sel=>{
    sel.addEventListener('change', async e=>{
      const k = e.target.dataset.date;
      wplan[k] = emptyDay(e.target.value);
      await persistAndRefresh();
    });
  });
  grid.querySelectorAll('[data-toggledetail]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      document.getElementById('detail-'+e.target.closest('[data-toggledetail]').dataset.toggledetail).classList.toggle('open');
    });
  });
  bindLogForm(grid, wplan, persistAndRefresh);
}

/* ------------------------------------------------------------------------
   11. BIBLIOTHÈQUE — gestion (CRUD), dans le menu "Plus"
   ------------------------------------------------------------------------ */
let libEditingKey = null; // null | 'NEW' | clé existante

function renderLibraryManage(){
  document.getElementById('libraryList').innerHTML = Object.keys(LIB).filter(k=>k!=='REPOS').map(key=>{
    const s = LIB[key];
    return `
      <div class="lib-card">
        <div class="lib-head"><span class="lib-dot" style="background:${s.color}"></span><span class="lib-name">${key} — ${s.name}</span></div>
        <div class="lib-meta">${s.duree} min · ${s.cible||'—'} · ${s.suunto}</div>
        <div class="lib-actions">
          <button class="btn small" data-editlib="${key}">Modifier</button>
          <button class="btn small danger" data-deletelib="${key}">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-editlib]').forEach(btn=>{
    btn.addEventListener('click', e=>{ libEditingKey = e.target.dataset.editlib; renderLibForm(); });
  });
  document.querySelectorAll('[data-deletelib]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      const key = e.target.dataset.deletelib;
      if(!confirm(`Supprimer la séance ${key} de la bibliothèque ?\n(Les jours déjà programmés avec ce type resteront visibles, marqués "séance supprimée".)`)) return;
      delete LIB[key];
      await saveLibrary();
      if(libEditingKey===key) libEditingKey=null;
      renderLibraryManage();
      renderWeek();
    });
  });
  renderLibForm();
}
function libFieldsHTML(vals){
  return `
    <div class="lib-form-row">
      <div><label>Code court</label><input type="text" id="lf-key" value="${vals.key}" maxlength="6" ${vals.locked?'disabled':''} placeholder="ex : T3"></div>
      <div><label>Catégorie</label>
        <select id="lf-tier">${Object.keys(TIER_LABELS).map(t=>`<option value="${t}" ${t===vals.tier?'selected':''}>${TIER_LABELS[t]}</option>`).join('')}</select>
      </div>
    </div>
    <label>Nom</label><input type="text" id="lf-name" value="${vals.name}" placeholder="ex : Tempo court">
    <div class="lib-form-row">
      <div><label>Durée (min)</label><input type="number" min="0" id="lf-duree" value="${vals.duree}"></div>
      <div><label>Intensité (0–10)</label><input type="number" min="0" max="10" step="0.5" id="lf-intensity" value="${vals.intensity}"></div>
    </div>
    <label>Cible (FC, RPE, allure…)</label><input type="text" id="lf-cible" value="${vals.cible||''}" placeholder="ex : 165–172 bpm">
    <label>Nom sur la montre Suunto</label><input type="text" id="lf-suunto" value="${vals.suunto||''}" placeholder="ex : T3 - Tempo court">
    <label>Objectif</label><input type="text" id="lf-objectif" value="${vals.objectif||''}" placeholder="ex : Travailler la relance">
    <label>À surveiller</label><input type="text" id="lf-watch" value="${vals.watch||''}" placeholder="ex : Rester relâché">
  `;
}
function renderLibForm(){
  const area = document.getElementById('libFormArea');
  if(libEditingKey===null){ area.innerHTML=''; return; }
  const isNew = libEditingKey==='NEW';
  const vals = isNew
    ? { key:'', name:'', tier:'green', duree:45, intensity:5, cible:'', suunto:'', objectif:'', watch:'', locked:false }
    : { ...LIB[libEditingKey], key:libEditingKey, locked:true };

  area.innerHTML = `
    <div class="lib-form">
      <div class="log-title">${isNew ? "Nouvelle séance" : "Modifier "+libEditingKey}</div>
      ${libFieldsHTML(vals)}
      <div class="lib-form-hint" id="lf-error" style="color:var(--red);"></div>
      <div class="log-actions" style="margin-top:12px;">
        <button class="btn primary" id="lf-save">Enregistrer</button>
        <button class="btn small" id="lf-cancel">Annuler</button>
      </div>
    </div>
  `;
  document.getElementById('lf-cancel').addEventListener('click', ()=>{ libEditingKey=null; renderLibForm(); });
  document.getElementById('lf-save').addEventListener('click', async ()=>{
    const key = document.getElementById('lf-key').value.trim().toUpperCase();
    const name = document.getElementById('lf-name').value.trim();
    const errBox = document.getElementById('lf-error');
    if(!key || !name){ errBox.textContent = "Le code et le nom sont obligatoires."; return; }
    if(key==='REPOS'){ errBox.textContent = "Ce code est réservé."; return; }
    if(isNew && LIB[key]){ errBox.textContent = "Ce code existe déjà."; return; }
    const tier = document.getElementById('lf-tier').value;
    LIB[key] = {
      name, tier, color:`var(--${tier})`,
      duree: parseInt(document.getElementById('lf-duree').value,10) || 0,
      intensity: parseFloat(document.getElementById('lf-intensity').value) || 0,
      cible: document.getElementById('lf-cible').value.trim(),
      suunto: document.getElementById('lf-suunto').value.trim() || '—',
      objectif: document.getElementById('lf-objectif').value.trim(),
      watch: document.getElementById('lf-watch').value.trim(),
    };
    await saveLibrary();
    libEditingKey = null;
    renderLibraryManage();
    renderWeek();
  });
}

/* ------------------------------------------------------------------------
   12. MA PROGRESSION
   ------------------------------------------------------------------------ */
const PROG_META = {
  vo2:{label:"VO₂", color:"var(--red)"},
  endurance:{label:"Endurance", color:"var(--green)"},
  gainage:{label:"Gainage", color:"var(--blue)"},
  force:{label:"Force", color:"var(--blue)"},
};
function renderProgress(){
  const box = document.getElementById('progressList');
  box.innerHTML = Object.keys(PROG_META).map(key=>{
    const meta = PROG_META[key]; const val = progression[key];
    const segs = Array.from({length:10},(_,i)=>`<div class="seg ${i<Math.round(val)?'filled':''}" style="--seg-color:${meta.color}"></div>`).join('');
    return `
      <div class="prog-item" style="--seg-color:${meta.color}">
        <div class="prog-head"><span class="prog-name">${meta.label}</span><span class="prog-val">${val}/10</span></div>
        <div class="seg-bar">${segs}</div>
        <input type="range" min="0" max="10" value="${val}" data-prog="${key}">
      </div>
    `;
  }).join('') + `<div class="prog-note">Ces jauges sont une estimation personnelle que tu ajustes toi-même selon tes sensations — pas une mesure scientifique.</div>`;

  box.querySelectorAll('[data-prog]').forEach(r=>{
    r.addEventListener('input', e=>{ progression[e.target.dataset.prog] = parseInt(e.target.value,10); renderProgress(); });
    r.addEventListener('change', saveProgression);
  });
}

/* ------------------------------------------------------------------------
   13. CARNET — journal hebdo + historique complet
   ------------------------------------------------------------------------ */
function sessionLineHTML(dateObj, entry){
  const s = getSessionDef(entry.session);
  const bits = [];
  if(typeof entry.plaisir==="number") bits.push(`Plaisir ${entry.plaisir}/10`);
  if(typeof entry.rpe==="number") bits.push(`RPE ${entry.rpe}/10`);
  if(typeof entry.fatigue==="number") bits.push(`Fatigue ${entry.fatigue}/10`);
  if(typeof entry.distance==="number") bits.push(`${entry.distance} km`);
  return `
    <div class="je-row" style="display:flex;gap:8px;align-items:flex-start;margin-top:6px;">
      <span class="lib-dot" style="background:${s.color};margin-top:5px;flex-shrink:0;"></span>
      <span>
        <b>${fmtDate(dateObj)}</b> — ${s.name}${bits.length ? ' · '+bits.join(' · ') : ''}
        ${entry.notes ? `<div style="color:var(--text-faint);font-style:italic;margin-top:2px;">"${entry.notes}"</div>` : ''}
      </span>
    </div>
  `;
}
function weekCardHTML(week, journal){
  const stats = computeStatsFor(week.plan, week.dates);
  const doneEntries = week.dates.map(d=>({d, e:week.plan[isoDate(d)]})).filter(x=>x.e && x.e.done && x.e.session!=='REPOS');
  return `
    <div class="journal-entry">
      <div class="je-week">Semaine ${isoWeekNumber(week.dates[0])} · ${fmtDate(week.dates[0])} → ${fmtDate(week.dates[6])}</div>
      <div class="je-row" style="color:var(--text-dim);">${stats.done}/${stats.total} séances · ${stats.km||'—'}${stats.km?' km':''} · charge ${stats.charge}${stats.plaisirAvg!=null?` · plaisir moyen ${stats.plaisirAvg}`:''}</div>
      ${journal && (journal.objectif||journal.commentaires||journal.decision||journal.plaisir!=null) ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);">
          ${journal.objectif?`<div class="je-row"><b>Objectif :</b> ${journal.objectif}</div>`:''}
          ${journal.commentaires?`<div class="je-row"><b>Commentaires :</b> ${journal.commentaires}</div>`:''}
          ${journal.plaisir!==''&&journal.plaisir!=null?`<div class="je-row"><b>Plaisir semaine :</b> ${journal.plaisir}/10</div>`:''}
          ${journal.decision?`<div class="je-row"><b>Décision :</b> ${journal.decision}</div>`:''}
        </div>` : ''}
      ${doneEntries.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);">${doneEntries.map(x=>sessionLineHTML(x.d,x.e)).join('')}</div>` : ''}
    </div>
  `;
}
async function renderJournal(){
  const box = document.getElementById('journalContent');
  box.innerHTML = `
    <div class="dash-strip">
      <div class="dash-title">Bilan de cette semaine</div>
      <div class="dash-row">${bilanRowHTML(computeStats())}</div>
    </div>
    <div class="journal-form">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-faint);">Semaine ${weekNum} (actuelle)</div>
      <label>Objectif de la semaine</label>
      <input type="text" id="j-objectif" value="${journalCurrent.objectif||''}" placeholder="ex : Construire le seuil">
      <label>Commentaires</label>
      <textarea id="j-commentaires" placeholder="Sensations, contexte, fatigue…">${journalCurrent.commentaires||''}</textarea>
      <label>Plaisir semaine (0–10)</label>
      <input type="number" min="0" max="10" id="j-plaisir" value="${journalCurrent.plaisir??''}">
      <label>Décision pour la suite</label>
      <input type="text" id="j-decision" value="${journalCurrent.decision||''}" placeholder="ex : Augmenter la sortie longue à 20 km">
      <div class="log-actions" style="margin-top:14px;">
        <button class="btn primary" id="j-save">Enregistrer la semaine</button>
      </div>
    </div>
    <div class="history-title">Carnet — semaines précédentes</div>
    <div id="journalHistory">${journalHistoryLoaded ? '' : '<div class="today-empty" style="padding:8px 0;">chargement…</div>'}</div>
  `;
  document.getElementById('j-save').addEventListener('click', async ()=>{
    journalCurrent = {
      objectif: document.getElementById('j-objectif').value,
      commentaires: document.getElementById('j-commentaires').value,
      plaisir: document.getElementById('j-plaisir').value===''?'':parseInt(document.getElementById('j-plaisir').value,10),
      decision: document.getElementById('j-decision').value,
    };
    await saveJournalCurrent();
  });

  if(!journalHistoryLoaded){
    journalHistoryLoaded = true;
    const weeks = await scanAllWeeks();
    const others = weeks.filter(w=>w.key!==weekKey);
    const hist = document.getElementById('journalHistory');
    if(others.length===0){ hist.innerHTML = `<div class="today-empty" style="padding:8px 0;">Rien pour l'instant — reviens ici la semaine prochaine.</div>`; return; }
    let html = '';
    for(const w of others){
      let journal = null;
      try{ const r = await Store.get('journal:'+w.key); journal = JSON.parse(r.value); }catch(e){}
      html += weekCardHTML(w, journal);
    }
    hist.innerHTML = html;
  }
}

/* ------------------------------------------------------------------------
   14. STATUT DU SPORTIF
   ------------------------------------------------------------------------ */
const STATUS_ROWS = [
  {key:"forme", label:"Forme"},
  {key:"recuperation", label:"Récupération"},
  {key:"charge", label:"Charge"},
  {key:"motivation", label:"Motivation"},
];
const STATUS_TEXT = {
  green:{forme:"Très bonne",recuperation:"Bonne",charge:"Légère",motivation:"Excellente"},
  yellow:{forme:"Correcte",recuperation:"Moyenne",charge:"Modérée",motivation:"Correcte"},
  red:{forme:"Fatigué",recuperation:"Faible",charge:"Élevée",motivation:"En baisse"},
};
function renderStatus(){
  document.getElementById('statusList').innerHTML = STATUS_ROWS.map(row=>{
    const val = statut[row.key];
    return `
      <div class="status-row">
        <div class="status-row-label">${row.label}</div>
        <div class="status-pills">
          <div class="status-pill ${val==='green'?'active-green':''}" data-key="${row.key}" data-val="green">🟢 ${STATUS_TEXT.green[row.key]}</div>
          <div class="status-pill ${val==='yellow'?'active-yellow':''}" data-key="${row.key}" data-val="yellow">🟡 ${STATUS_TEXT.yellow[row.key]}</div>
          <div class="status-pill ${val==='red'?'active-red':''}" data-key="${row.key}" data-val="red">🔴 ${STATUS_TEXT.red[row.key]}</div>
        </div>
      </div>
    `;
  }).join('');
  document.querySelectorAll('.status-pill').forEach(p=>{
    p.addEventListener('click', async e=>{
      const el = e.currentTarget;
      statut[el.dataset.key] = el.dataset.val;
      await saveStatut();
      renderStatus();
      renderStatusSummary();
    });
  });
}
function renderStatusSummary(){
  const parts = STATUS_ROWS.map(row=>`${row.label.toLowerCase()} : ${STATUS_TEXT[statut[row.key]][row.key].toLowerCase()}`);
  document.getElementById('statusSummary').innerHTML = `<div class="status-summary">Résumé de la semaine — ${parts.join(' · ')}.</div>`;
}

/* ------------------------------------------------------------------------
   15. STATISTIQUES GLOBALES — lecture rapide, aucun graphique
   ------------------------------------------------------------------------ */
async function renderStats(){
  const box = document.getElementById('statsContent');
  box.innerHTML = `<div class="today-empty">Calcul en cours…</div>`;
  const weeks = await scanAllWeeks();

  let km=0, nb=0, tempsMin=0, charge=0, plaisirSum=0, plaisirN=0, rpeSum=0, rpeN=0;
  const repartition = {};
  weeks.forEach(w=>{
    w.dates.forEach(d=>{
      const e = w.plan[isoDate(d)];
      if(!e || !e.done || e.session==='REPOS') return;
      const s = getSessionDef(e.session);
      nb++;
      tempsMin += s.duree;
      const rpeUsed = typeof e.rpe==='number' ? e.rpe : s.intensity;
      charge += rpeUsed * (s.duree/60);
      if(typeof e.distance==='number') km += e.distance;
      if(typeof e.plaisir==='number'){ plaisirSum+=e.plaisir; plaisirN++; }
      if(typeof e.rpe==='number'){ rpeSum+=e.rpe; rpeN++; }
      repartition[e.session] = (repartition[e.session]||0)+1;
    });
  });
  const h = Math.floor(tempsMin/60), m = Math.round(tempsMin%60);
  const repartitionLines = Object.keys(repartition).sort((a,b)=>repartition[b]-repartition[a])
    .map(k=>`<div class="stat-row"><div class="stat-row-label">${k} — ${getSessionDef(k).name}</div><div class="stat-row-val">${repartition[k]}</div></div>`).join('');

  box.innerHTML = `
    <div class="stat-list">
      <div class="stat-row"><div class="stat-row-label">Kilométrage total</div><div class="stat-row-val">${Math.round(km*10)/10} km</div></div>
      <div class="stat-row"><div class="stat-row-label">Séances réalisées</div><div class="stat-row-val">${nb}</div></div>
      <div class="stat-row"><div class="stat-row-label">Temps d'entraînement</div><div class="stat-row-val">${h}h${pad(m)}</div></div>
      <div class="stat-row"><div class="stat-row-label">Charge cumulée</div><div class="stat-row-val">${Math.round(charge)}</div></div>
      <div class="stat-row"><div class="stat-row-label">Plaisir moyen</div><div class="stat-row-val">${plaisirN? Math.round((plaisirSum/plaisirN)*10)/10 : '—'}</div></div>
      <div class="stat-row"><div class="stat-row-label">RPE moyen</div><div class="stat-row-val">${rpeN? Math.round((rpeSum/rpeN)*10)/10 : '—'}</div></div>
    </div>
    <div class="dash-title" style="margin:4px 2px 8px;">Répartition des séances</div>
    <div class="stat-list">${repartitionLines || `<div class="stat-row"><div class="stat-row-label">Aucune séance enregistrée pour l'instant</div></div>`}</div>
  `;
}

/* ------------------------------------------------------------------------
   16. RECORDS — auto (à partir des données) + manuels (déclaratifs)
   ------------------------------------------------------------------------ */
async function renderRecords(){
  const box = document.getElementById('recordsContent');
  box.innerHTML = `<div class="today-empty">Calcul en cours…</div>`;
  const weeks = await scanAllWeeks();

  let longestSortie = null, longestSeance = null;
  weeks.forEach(w=>{
    w.dates.forEach(d=>{
      const e = w.plan[isoDate(d)];
      if(!e || !e.done || e.session==='REPOS') return;
      const s = getSessionDef(e.session);
      if(typeof e.distance==='number' && (!longestSortie || e.distance>longestSortie.km)){
        longestSortie = { km:e.distance, date:d };
      }
      if(!longestSeance || s.duree>longestSeance.min){
        longestSeance = { min:s.duree, date:d, name:s.name };
      }
    });
  });

  box.innerHTML = `
    <div class="dash-title" style="margin:0 2px 8px;">Records automatiques</div>
    <div class="stat-list">
      <div class="stat-row"><div class="stat-row-label">Plus longue sortie</div><div class="stat-row-val">${longestSortie? longestSortie.km+' km' : '—'}${longestSortie?`<small>${fmtDate(longestSortie.date)}</small>`:''}</div></div>
      <div class="stat-row"><div class="stat-row-label">Plus longue séance</div><div class="stat-row-val">${longestSeance? longestSeance.min+' min' : '—'}${longestSeance?`<small>${longestSeance.name} · ${fmtDate(longestSeance.date)}</small>`:''}</div></div>
    </div>
    <div class="section-hint" style="margin-top:10px;">Calculés à partir des séances enregistrées dans le carnet.</div>

    <div class="dash-title" style="margin:18px 2px 8px;">Records personnels</div>
    <div class="section-hint" style="margin-top:-6px;">Non mesurés automatiquement — mets-les à jour toi-même quand tu bats un record.</div>
    <div class="settings-form">
      <label>Meilleur 10 km</label><input type="text" id="rec-10km" value="${recordsManual.meilleur10km||''}" placeholder="ex : 48:32">
      <label>FC repos minimale</label><input type="number" id="rec-fcrepos" value="${recordsManual.fcReposMin||''}" placeholder="ex : 48">
      <label>VFC maximale</label><input type="number" id="rec-vfc" value="${recordsManual.vfcMax||''}" placeholder="ex : 72">
      <label>Record gainage</label><input type="text" id="rec-gainage" value="${recordsManual.recordGainage||''}" placeholder="ex : 2:30">
      <label>Record pompes (série)</label><input type="number" id="rec-pompes" value="${recordsManual.recordPompes||''}" placeholder="ex : 32">
      <div class="log-actions" style="margin-top:14px;"><button class="btn primary" id="rec-save">Enregistrer</button></div>
    </div>
  `;
  document.getElementById('rec-save').addEventListener('click', async ()=>{
    recordsManual = {
      meilleur10km: document.getElementById('rec-10km').value.trim(),
      fcReposMin: document.getElementById('rec-fcrepos').value,
      vfcMax: document.getElementById('rec-vfc').value,
      recordGainage: document.getElementById('rec-gainage').value.trim(),
      recordPompes: document.getElementById('rec-pompes').value,
    };
    await saveRecordsManual();
  });
}

/* ------------------------------------------------------------------------
   17. PARAMÈTRES
   ------------------------------------------------------------------------ */
function renderSettings(){
  const box = document.getElementById('settingsContent');
  box.innerHTML = `
    <div class="settings-form">
      <label>Nom du sportif</label><input type="text" id="set-nom" value="${settings.nom||''}" placeholder="ex : Guillaume">
      <label>FC max</label><input type="number" id="set-fcmax" value="${settings.fcMax||''}" placeholder="ex : 196">
      <label>FC repos</label><input type="number" id="set-fcrepos" value="${settings.fcRepos||''}" placeholder="ex : 52">
      <label>VFC moyenne</label><input type="number" id="set-vfc" value="${settings.vfc||''}" placeholder="ex : 60">
      <label>Objectifs</label><textarea id="set-objectifs" placeholder="ex : Reprise du badminton en forme, ventre plat, 20km en aisance">${settings.objectifs||''}</textarea>
      <div class="log-actions" style="margin-top:14px;"><button class="btn primary" id="set-save">Enregistrer</button></div>
    </div>
  `;
  document.getElementById('set-save').addEventListener('click', async ()=>{
    settings = {
      nom: document.getElementById('set-nom').value.trim(),
      fcMax: document.getElementById('set-fcmax').value,
      fcRepos: document.getElementById('set-fcrepos').value,
      vfc: document.getElementById('set-vfc').value,
      objectifs: document.getElementById('set-objectifs').value,
    };
    await saveSettings();
  });
}

/* ------------------------------------------------------------------------
   18. DONNÉES — export / import JSON (base pour une synchro future)
   ------------------------------------------------------------------------ */
function renderData(){
  document.getElementById('dataContent').innerHTML = `
    <div class="section-hint">Toutes tes données (bibliothèque, semaines, carnet, réglages) restent sur cet appareil, dans ce navigateur. Exporte régulièrement une sauvegarde JSON — c'est aussi la base d'une future synchronisation entre appareils.</div>
    <div class="reset-wrap"><button class="btn primary" id="exportBtn">⬇️ Exporter mes données (JSON)</button></div>
    <div class="reset-wrap">
      <label class="btn small" for="importFile" style="display:inline-block;">⬆️ Importer une sauvegarde</label>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
    </div>
    <div class="section-hint" id="importMsg"></div>
  `;
  document.getElementById('exportBtn').addEventListener('click', async ()=>{
    const r = await Store.list('');
    const entries = {};
    for(const k of r.keys){ try{ const v = await Store.get(k); entries[k]=v.value; }catch(e){} }
    const payload = { app:"Run&Bad Guillaume", exportedAt:new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `runbad-export-${isoDate(new Date())}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('importFile').addEventListener('change', async e=>{
    const file = e.target.files[0]; if(!file) return;
    const msg = document.getElementById('importMsg');
    try{
      const text = await file.text();
      const payload = JSON.parse(text);
      if(!payload.entries) throw new Error("Fichier invalide");
      for(const k of Object.keys(payload.entries)){ await Store.set(k, payload.entries[k]); }
      msg.textContent = "Import réussi — rechargement…";
      msg.style.color = "var(--green)";
      setTimeout(()=>location.reload(), 1200);
    }catch(err){
      msg.textContent = "Échec de l'import : fichier invalide.";
      msg.style.color = "var(--red)";
    }
  });
}

/* ------------------------------------------------------------------------
   19. NAVIGATION
   ------------------------------------------------------------------------ */
const PRIMARY_TABS = ["today","week","carnet","more"];
const RENDERERS = {
  today: renderToday, week: renderWeek, progress: renderProgress, journal: renderJournal,
  status: ()=>{ renderStatus(); renderStatusSummary(); }, library: renderLibraryManage,
  stats: renderStats, records: renderRecords, settings: renderSettings, data: renderData,
};
function showPanel(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panelId = id === 'carnet' ? 'journal' : id;
  const panel = document.getElementById('panel-'+panelId);
  if(panel) panel.classList.add('active');

  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const tabId = PRIMARY_TABS.includes(id) ? id : (id==='journal' ? 'carnet' : 'more');
  const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if(tabBtn) tabBtn.classList.add('active');

  const renderFn = RENDERERS[panelId];
  if(renderFn) renderFn();
}
function wireNav(){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=> showPanel(btn.dataset.tab));
  });
  document.querySelector('.topbar-plus').addEventListener('click', ()=> showPanel('more'));
  document.querySelectorAll('[data-more]').forEach(btn=>{
    btn.addEventListener('click', ()=> showPanel(btn.dataset.more));
  });
  document.querySelectorAll('[data-back]').forEach(btn=>{
    btn.addEventListener('click', ()=> showPanel(btn.dataset.back));
  });

  document.getElementById('weekPrevBtn').addEventListener('click', async ()=>{ viewedMonday.setDate(viewedMonday.getDate()-7); await renderWeek(); });
  document.getElementById('weekNextBtn').addEventListener('click', async ()=>{ viewedMonday.setDate(viewedMonday.getDate()+7); await renderWeek(); });
  document.getElementById('jumpTodayBtn').addEventListener('click', async ()=>{ viewedMonday = new Date(monday); await renderWeek(); });
  document.getElementById('resetBtn').addEventListener('click', async ()=>{
    const key = keyForMonday(viewedMonday);
    const wplan = await ensureWeekLoaded(viewedMonday);
    weekDatesFor(viewedMonday).forEach(d=>{ wplan[isoDate(d)] = emptyDay("REPOS"); });
    await saveWeekAt(viewedMonday);
    if(key===weekKey) renderToday();
    renderWeek();
  });
  document.getElementById('addLibBtn').addEventListener('click', ()=>{ libEditingKey='NEW'; renderLibForm(); });
}

/* ------------------------------------------------------------------------
   20. DÉMARRAGE
   ------------------------------------------------------------------------ */
function renderAll(){
  document.getElementById('topDate').textContent = fmtFullDate(today);
  const activePanel = document.querySelector('.panel.active');
  const activeId = activePanel ? activePanel.id.replace('panel-','') : 'today';
  showPanel(activeId);
}

(async ()=>{
  setStatusLine("chargement…");
  wireNav();
  await loadAll();
  renderAll();
  setStatusLine("à jour");

  // Enregistrement du service worker (rend l'app utilisable hors connexion).
  // Ne fonctionne que si l'app est servie en http(s) — pas en fichier local.
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
})();
