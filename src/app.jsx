import { useState, useEffect, useCallback, useRef } from "react";

// ── Electron bridge (falls back to localStorage in browser dev)
const isElectron = !!window.electronAPI;

const ROWS = [
  { key: "intensity", label: "Intensité (1–10)", type: "number", min: 1, max: 10 },
  { key: "duration",  label: "Durée (h)",        type: "number", min: 0, max: 72 },
  { key: "side",      label: "Uni/bilatéral (1/2)", type: "side" },
  { key: "pulsating", label: "Pulsant/palpitant", type: "bool" },
  { key: "dull",      label: "Sourd/oppressant",  type: "bool" },
  { key: "aura",      label: "Aura",              type: "bool" },
  { key: "nausea",    label: "Nausées/vomissements", type: "bool" },
  { key: "light",     label: "Sensibilité lumière/bruit", type: "bool" },
  { key: "smell",     label: "Sensibilité odeurs", type: "bool" },
  { key: "menstruation", label: "Menstruation",   type: "bool" },
  { key: "prophylaxis",  label: "Début prophylaxie", type: "bool" },
  { key: "note",      label: "Note",              type: "note" },
];

const MONTHS       = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jui","Jul","Aoû","Sep","Oct","Nov","Déc"];
const today = new Date();

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fileKey(y, m)     { return `migraine_${y}_${String(m).padStart(2,"0")}.json`; }
function settingsFile()    { return "migraine_settings.json"; }

// ── Storage abstraction
async function loadFile(filename) {
  if (isElectron) {
    const raw = await window.electronAPI.readData(filename);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  } else {
    try { return JSON.parse(localStorage.getItem(filename)); } catch { return null; }
  }
}

async function saveFile(filename, data) {
  const str = JSON.stringify(data, null, 2);
  if (isElectron) {
    await window.electronAPI.writeData(filename, str);
  } else {
    localStorage.setItem(filename, str);
  }
}

async function loadSettings() {
  return (await loadFile(settingsFile())) || { meds: ["Dafalgan"] };
}

async function loadMonth(y, m) {
  return (await loadFile(fileKey(y, m))) || {};
}

async function getAllMonthsData(meds) {
  const result = [];
  if (isElectron) {
    const files = await window.electronAPI.listData();
    for (const f of files) {
      if (!f.startsWith("migraine_") || f === "migraine_settings.json") continue;
      const raw = await window.electronAPI.readData(f);
      try {
        const parts = f.replace("migraine_","").replace(".json","").split("_");
        const y = parseInt(parts[0]), mo = parseInt(parts[1]);
        const data = JSON.parse(raw);
        if (Object.keys(data).length) result.push({ year: y, month: mo, data });
      } catch {}
    }
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith("migraine_") || k === "migraine_settings.json") continue;
      try {
        const parts = k.replace("migraine_","").replace(".json","").split("_");
        const y = parseInt(parts[0]), mo = parseInt(parts[1]);
        const data = JSON.parse(localStorage.getItem(k));
        if (Object.keys(data).length) result.push({ year: y, month: mo, data });
      } catch {}
    }
  }
  return result.sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

function buildEpisodes(monthData, meds) {
  return Object.entries(monthData)
    .filter(([k]) => k.startsWith("d"))
    .map(([k,v]) => ({ day: parseInt(k.slice(1)), ...v }))
    .filter(e => e.intensity)
    .sort((a,b) => a.day - b.day);
}

function computeSynthese(episodes, meds) {
  if (!episodes.length) return null;
  const n = episodes.length;
  return {
    count: n,
    avgInt: (episodes.reduce((s,e) => s + (Number(e.intensity)||0), 0) / n).toFixed(1),
    avgDur: (episodes.reduce((s,e) => s + (Number(e.duration)||0),  0) / n).toFixed(1),
    withAura:   episodes.filter(e => e.aura).length,
    withNausea: episodes.filter(e => e.nausea).length,
    withLight:  episodes.filter(e => e.light).length,
    bilateral:  episodes.filter(e => e.side == 2).length,
    medCounts:  meds.map((name,i) => ({ name, count: episodes.filter(e => e[`med_${i}`]).length })),
  };
}

function buildPrompt(episodes, allData, settings, year, month) {
  const useHistory = episodes.length < 3;
  const meds = settings.meds;
  const fmt = (e, y, m) => {
    const p = [`Jour ${e.day} (${MONTHS[m]} ${y})`];
    if (e.intensity) p.push(`intensité ${e.intensity}/10`);
    if (e.duration)  p.push(`durée ${e.duration}h`);
    if (e.side)      p.push(e.side == 1 ? "unilatéral" : "bilatéral");
    if (e.pulsating) p.push("pulsant");
    if (e.dull)      p.push("sourd/oppressant");
    if (e.aura)      p.push("AURA présente");
    if (e.nausea)    p.push("nausées/vomissements");
    if (e.light)     p.push("photophobie/phonophobie");
    if (e.smell)     p.push("osmophobie");
    if (e.menstruation) p.push("menstruation");
    if (e.prophylaxis)  p.push("début prophylaxie");
    meds.forEach((name,i) => { if (e[`med_${i}`]) p.push(`pris: ${name}`); });
    if (e.note) p.push(`note: "${e.note}"`);
    return p.join(" | ");
  };
  let epTxt = "";
  if (useHistory && allData.length) {
    epTxt = allData.map(({year:y,month:m,data}) => buildEpisodes(data,meds).map(e => fmt(e,y,m)).join("\n")).filter(Boolean).join("\n");
  } else {
    epTxt = episodes.map(e => fmt(e, year, month)).join("\n");
  }
  const scope = useHistory
    ? `l'historique complet (moins de 3 épisodes ce mois)`
    : `le mois de ${MONTHS[month]} ${year}`;
  return `Tu es un assistant médical spécialisé en céphalologie. Tu analyses un journal de migraines. Ton analyse sera relue par le médecin traitant. Rédige en français, de manière structurée et médicalement rigoureuse.

Données : ${scope}
Médicaments aigus : ${meds.join(", ") || "non renseignés"}

--- ÉPISODES ---
${epTxt || "Aucun épisode enregistré."}
---

Produis une analyse structurée :

1. RÉSUMÉ CLINIQUE — fréquence, durée, intensité moyennes ; classification probable ; caractéristiques de l'aura si présente.
2. ANALYSE DES SYMPTÔMES ASSOCIÉS — signes végétatifs, caractère pulsatile vs sourd, latéralisation, lien menstruel.
3. EFFICACITÉ DES TRAITEMENTS AIGUS — fréquence d'utilisation, contexte, évaluation de l'adéquation.
4. PATTERNS ET FACTEURS DÉCLENCHANTS — récurrence temporelle, corrélations menstruation/prophylaxie.
5. RECOMMANDATIONS POUR LE MÉDECIN — points d'attention, ajustements thérapeutiques, critères de chronicisation.

Sois factuel et prudent. Indique quand les données sont insuffisantes.`;
}

function intensityColor(val) {
  if (!val) return "#f0f0f0";
  const v = Number(val);
  if (v <= 3) return "#c0dd97";
  if (v <= 5) return "#FAC775";
  if (v <= 7) return "#F0997B";
  return "#E24B4A";
}

function exportPDF(year, month, data, settings, aiResult) {
  const meds = settings.meds;
  const days = daysInMonth(year, month);
  const allRows = [...ROWS, ...meds.map((m,i) => ({ key:`med_${i}`, label:m, type:"medcheck" }))];
  const episodes = buildEpisodes(data, meds);
  const synthese = computeSynthese(episodes, meds);
  const cv = (day,key) => { const v = data[`d${day}`]?.[key]??""; if(v===true||v===1)return"✓"; return v||""; };
  const tableRows = allRows.filter(r=>r.key!=="note").map(row => {
    const cells = Array.from({length:days},(_,i)=>i+1).map(d=>`<td style="text-align:center;font-size:9px;padding:1px;border:0.5px solid #ccc;min-width:18px">${cv(d,row.key)}</td>`).join("");
    return `<tr><td style="font-size:9px;padding:2px 4px;border:0.5px solid #ccc;white-space:nowrap">${row.label}</td>${cells}</tr>`;
  }).join("");
  const synHtml = synthese ? `<div style="margin-top:20px"><h3 style="font-size:11px;color:#185FA5;margin-bottom:8px">Synthèse</h3><table style="font-size:10px;border-collapse:collapse"><tr><td style="padding:2px 8px 2px 0;color:#555">Épisodes</td><td>${synthese.count}</td></tr><tr><td style="padding:2px 8px 2px 0;color:#555">Intensité moy.</td><td>${synthese.avgInt}/10</td></tr><tr><td style="padding:2px 8px 2px 0;color:#555">Durée moy.</td><td>${synthese.avgDur}h</td></tr>${synthese.medCounts.filter(m=>m.count>0).map(m=>`<tr><td style="padding:2px 8px 2px 0;color:#555">${m.name}</td><td>${m.count} prise(s)</td></tr>`).join("")}</table></div>` : "";
  const aiHtml  = aiResult ? `<div style="margin-top:24px;page-break-before:always"><h3 style="font-size:12px;color:#185FA5;margin-bottom:10px">Analyse médicale (Claude)</h3><div style="font-size:10px;line-height:1.7;white-space:pre-wrap">${aiResult}</div></div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MigraineLog ${MONTHS[month]} ${year}</title><style>@media print{.np{display:none!important;}}</style></head><body style="font-family:Arial,sans-serif;padding:20px;color:#222"><div style="display:flex;justify-content:space-between;margin-bottom:16px"><div><h1 style="font-size:16px;margin:0 0 4px">MigraineLog</h1><p style="font-size:12px;color:#555;margin:0">${MONTHS[month]} ${year}</p></div><button class="np" onclick="window.print()" style="padding:6px 14px;font-size:12px;cursor:pointer">Imprimer / PDF</button></div><div style="overflow-x:auto"><table style="border-collapse:collapse"><thead><tr style="background:#f0f4fa"><th style="padding:4px 8px;text-align:left;font-size:9px;border:0.5px solid #ccc;min-width:120px">Symptôme</th>${Array.from({length:days},(_,i)=>`<th style="text-align:center;font-size:9px;padding:2px;border:0.5px solid #ccc;min-width:18px">${i+1}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div>${synHtml}${aiHtml}</body></html>`;
  const w = window.open("","_blank"); w.document.write(html); w.document.close();
}

// ══════════════════════════════════════════
export default function App() {
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [data,  setData]  = useState({});
  const [settings, setSettings] = useState({ meds: ["Dafalgan"] });
  const [view,  setView]  = useState("grid");
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState("");
  const [aiResult,  setAiResult]  = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");
  const [noteModal, setNoteModal] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [annualYear, setAnnualYear] = useState(today.getFullYear());
  const [tooltip, setTooltip] = useState(null);
  const [dataDir, setDataDir] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved"); // saved | saving | error
  const saveTimer = useRef(null);

  // Init
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      const d = await loadMonth(year, month);
      setData(d);
      if (isElectron) {
        const dir = await window.electronAPI.getDataDir();
        setDataDir(dir);
      }
    })();
  }, []);

  useEffect(() => {
    loadMonth(year, month).then(setData);
  }, [year, month]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const persistData = useCallback((y, m, newData) => {
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveFile(fileKey(y, m), newData);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 400);
  }, []);

  const setCell = useCallback((day, key, val) => {
    setData(prev => {
      const next = { ...prev };
      const dk = `d${day}`;
      next[dk] = { ...(next[dk] || {}), [key]: val };
      if (val === "" || val === null || val === undefined) delete next[dk][key];
      if (!Object.keys(next[dk]).length) delete next[dk];
      persistData(year, month, next);
      return next;
    });
  }, [year, month, persistData]);

  const getCell = (day, key) => data[`d${day}`]?.[key] ?? "";

  const days = daysInMonth(year, month);
  const cols = Array.from({ length: days }, (_, i) => i + 1);
  const prevMonth = () => { if (month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };
  const isToday = (d) => d===today.getDate()&&year===today.getFullYear()&&month===today.getMonth();

  const handleExportJSON = async () => {
    const allData = await getAllMonthsData(settings.meds);
    const out = { "migraine_settings": settings };
    allData.forEach(({ year:y, month:m, data:d }) => { out[fileKey(y,m)] = d; });
    const str = JSON.stringify(out, null, 2);
    if (isElectron) {
      const ok = await window.electronAPI.exportJSON(str);
      if (ok) showToast("Exporté");
    } else {
      const b = new Blob([str],{type:"application/json"});
      const a = document.createElement("a"); a.href=URL.createObjectURL(b);
      a.download=`migrainelog_export.json`; a.click(); showToast("Exporté");
    }
  };

  const handleImportJSON = async (e) => {
    let str = null;
    if (isElectron) {
      str = await window.electronAPI.importJSON();
    } else {
      const file = e?.target?.files?.[0]; if (!file) return;
      str = await new Promise(res => { const r=new FileReader(); r.onload=ev=>res(ev.target.result); r.readAsText(file); });
      e.target.value = "";
    }
    if (!str) return;
    try {
      const obj = JSON.parse(str);
      for (const [k, v] of Object.entries(obj)) await saveFile(k, v);
      if (obj["migraine_settings"]) setSettings(obj["migraine_settings"]);
      setData(await loadMonth(year, month));
      showToast("Données importées");
    } catch { showToast("Erreur d'import"); }
  };

  const handleChooseDir = async () => {
    const dir = await window.electronAPI.chooseDataDir();
    if (dir) { setDataDir(dir); showToast("Dossier mis à jour"); }
  };

  const addMed    = () => { const s={...settings,meds:[...settings.meds,`Médicament ${settings.meds.length+1}`]}; setSettings(s); saveFile(settingsFile(),s); };
  const renameMed = (i,val) => { const meds=[...settings.meds]; meds[i]=val; const s={...settings,meds}; setSettings(s); saveFile(settingsFile(),s); };
  const deleteMed = (i) => { const meds=settings.meds.filter((_,idx)=>idx!==i); const s={...settings,meds}; setSettings(s); saveFile(settingsFile(),s); setConfirmDel(null); };

  const episodes = buildEpisodes(data, settings.meds);
  const synthese = computeSynthese(episodes, settings.meds);
  const allRows  = [...ROWS, ...settings.meds.map((m,i) => ({ key:`med_${i}`, label:m, type:"medcheck", idx:i }))];

  const launchAI = async () => {
    setAiLoading(true); setAiResult(""); setAiError("");
    try {
      const allData = await getAllMonthsData(settings.meds);
      const prompt = buildPrompt(episodes, allData, settings, year, month);
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{role:"user",content:prompt}] })
      });
      const json = await resp.json();
      const text = json.content?.map(b=>b.text||"").join("")||"";
      if (!text) throw new Error();
      setAiResult(text);
    } catch { setAiError("Erreur lors de l'analyse. Vérifiez votre connexion."); }
    setAiLoading(false);
  };

  const openNote = (day) => { setNoteModal(day); setNoteDraft(getCell(day,"note")||""); };
  const saveNote = () => { setCell(noteModal,"note",noteDraft.trim()||""); setNoteModal(null); };

  // Annual
  const [annualData, setAnnualData] = useState([]);
  useEffect(() => {
    Promise.all(Array.from({length:12},(_,m)=>loadMonth(annualYear,m))).then(results => {
      setAnnualData(results.map((d,m) => {
        const eps = buildEpisodes(d, settings.meds);
        const dm = {};
        Object.entries(d).forEach(([k,v])=>{ if(k.startsWith("d")) dm[parseInt(k.slice(1))]=v; });
        return { month:m, episodes:eps, count:eps.length, avgInt:eps.length?(eps.reduce((s,e)=>s+(Number(e.intensity)||0),0)/eps.length).toFixed(1):null, days:daysInMonth(annualYear,m), dayMap:dm };
      }));
    });
  }, [annualYear, settings.meds]);

  const annualTotal   = annualData.reduce((s,m)=>s+m.count,0);
  const annualAvgInt  = annualData.filter(m=>m.avgInt).length
    ? (annualData.filter(m=>m.avgInt).reduce((s,m)=>s+parseFloat(m.avgInt),0)/annualData.filter(m=>m.avgInt).length).toFixed(1)
    : null;

  const CELL=36, LABEL_W=200;

  const tabs = [
    {id:"grid",    icon:"ti-table",         label:"Grille"},
    {id:"synthese",icon:"ti-chart-bar",     label:"Synthèse"},
    {id:"annual",  icon:"ti-calendar-stats",label:"Annuel"},
    {id:"ai",      icon:"ti-brain",         label:"Analyse IA"},
    {id:"settings",icon:"ti-settings",      label:"Paramètres"},
  ];

  return (
    <div style={{fontSize:13,color:"var(--color-text-primary)"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <span style={{fontSize:18,fontWeight:500,flex:1}}>MigraineLog</span>

        {/* Save status */}
        <span style={{fontSize:11,color:saveStatus==="error"?"var(--color-text-danger)":"var(--color-text-tertiary)",display:"flex",alignItems:"center",gap:4}}>
          {saveStatus==="saving" && <><i className="ti ti-loader-2" style={{fontSize:12}} aria-hidden="true"></i> Sauvegarde…</>}
          {saveStatus==="saved"  && <><i className="ti ti-check"    style={{fontSize:12}} aria-hidden="true"></i> Sauvegardé</>}
          {saveStatus==="error"  && <><i className="ti ti-alert-circle" style={{fontSize:12}} aria-hidden="true"></i> Erreur</>}
        </span>

        {isElectron
          ? <button onClick={handleImportJSON} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}><i className="ti ti-upload" aria-hidden="true"></i> Importer</button>
          : <label style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",padding:"5px 10px",fontSize:12}}>
              <i className="ti ti-upload" aria-hidden="true"></i> Importer
              <input type="file" accept=".json" onChange={handleImportJSON} style={{display:"none"}}/>
            </label>
        }
        <button onClick={handleExportJSON} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}><i className="ti ti-download" aria-hidden="true"></i> Exporter</button>
        <button onClick={()=>exportPDF(year,month,data,settings,aiResult)} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}><i className="ti ti-file-type-pdf" aria-hidden="true"></i> PDF</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",marginBottom:16,borderBottom:"0.5px solid var(--color-border-tertiary)",overflowX:"auto"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setView(t.id)} style={{
            display:"flex",alignItems:"center",gap:5,padding:"8px 12px",fontSize:12,whiteSpace:"nowrap",
            border:"none",borderBottom:view===t.id?"2px solid var(--color-text-info)":"2px solid transparent",
            borderRadius:0,background:"transparent",
            color:view===t.id?"var(--color-text-info)":"var(--color-text-secondary)",
            fontWeight:view===t.id?500:400,cursor:"pointer"
          }}>
            <i className={`ti ${t.icon}`} aria-hidden="true"></i>{t.label}
          </button>
        ))}
      </div>

      {/* Month nav */}
      {(view==="grid"||view==="synthese")&&(
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <button onClick={prevMonth}><i className="ti ti-arrow-left" aria-hidden="true"></i></button>
          <span style={{fontWeight:500,minWidth:140,textAlign:"center"}}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth}><i className="ti ti-arrow-right" aria-hidden="true"></i></button>
        </div>
      )}

      {/* GRID */}
      {view==="grid"&&(
        <>
          <div style={{overflowX:"auto",borderRadius:"var(--border-radius-lg)",border:"0.5px solid var(--color-border-tertiary)"}}>
            <table style={{borderCollapse:"collapse",tableLayout:"fixed",width:LABEL_W+days*CELL+"px"}}>
              <thead>
                <tr style={{background:"var(--color-background-secondary)"}}>
                  <th style={{width:LABEL_W,padding:"6px 10px",textAlign:"left",fontWeight:500,borderRight:"0.5px solid var(--color-border-tertiary)",position:"sticky",left:0,background:"var(--color-background-secondary)",zIndex:2,fontSize:12}}>Symptôme</th>
                  {cols.map(d=>(
                    <th key={d} style={{width:CELL,textAlign:"center",fontWeight:isToday(d)?500:400,fontSize:11,padding:"6px 0",color:isToday(d)?"var(--color-text-info)":"var(--color-text-secondary)",borderLeft:"0.5px solid var(--color-border-tertiary)"}}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((row,ri)=>(
                  <tr key={row.key} style={{background:ri%2===0?"var(--color-background-primary)":"var(--color-background-secondary)"}}>
                    <td style={{padding:"3px 10px",borderRight:"0.5px solid var(--color-border-tertiary)",position:"sticky",left:0,background:ri%2===0?"var(--color-background-primary)":"var(--color-background-secondary)",zIndex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:LABEL_W,fontSize:12}}>
                      {row.key==="note"&&<i className="ti ti-notes" style={{fontSize:12,marginRight:4,color:"var(--color-text-secondary)"}} aria-hidden="true"></i>}
                      {row.label}
                    </td>
                    {cols.map(d=>{
                      const v=getCell(d,row.key);
                      const hasData=data[`d${d}`]&&Object.keys(data[`d${d}`]).length>0;
                      return(
                        <td key={d} style={{textAlign:"center",padding:"2px 1px",borderLeft:"0.5px solid var(--color-border-tertiary)",background:hasData&&ri%2===0?"rgba(55,138,221,0.04)":undefined}}>
                          {row.type==="note"
                            ?<button onClick={()=>openNote(d)} style={{width:CELL-4,height:26,border:"none",background:"transparent",cursor:"pointer",color:v?"var(--color-text-info)":"var(--color-text-tertiary)",fontSize:11,padding:0}} aria-label={v?"Voir note":"Ajouter note"}>
                                {v?<i className="ti ti-notes" style={{fontSize:13}} aria-hidden="true"></i>:<span>–</span>}
                              </button>
                            :<CellInput row={row} val={v} onChange={val=>setCell(d,row.key,val)}/>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{color:"var(--color-text-secondary)",fontSize:11,marginTop:8}}>
            ✓ = présent · clic = effacer · 1/2 = uni/bilatéral
          </div>
        </>
      )}

      {/* SYNTHESE */}
      {view==="synthese"&&(
        <div>
          {!synthese
            ?<p style={{color:"var(--color-text-secondary)",textAlign:"center",marginTop:32}}>Aucun épisode ce mois.</p>
            :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
              <MetricCard label="Épisodes"          value={synthese.count}     unit=""               icon="ti-bolt"/>
              <MetricCard label="Intensité moy."    value={synthese.avgInt}    unit="/10"            icon="ti-activity"/>
              <MetricCard label="Durée moy."        value={synthese.avgDur}    unit="h"              icon="ti-clock"/>
              <MetricCard label="Avec aura"         value={synthese.withAura}  unit={`/${synthese.count}`} icon="ti-eye"/>
              <MetricCard label="Nausées"           value={synthese.withNausea} unit={`/${synthese.count}`} icon="ti-mood-sick"/>
              <MetricCard label="Photo/phonophobie" value={synthese.withLight} unit={`/${synthese.count}`} icon="ti-sun"/>
              <MetricCard label="Bilatéral"         value={synthese.bilateral} unit={`/${synthese.count}`} icon="ti-arrows-left-right"/>
              {synthese.medCounts.filter(m=>m.count>0).map((m,i)=>(
                <MetricCard key={i} label={m.name} value={m.count} unit="prise(s)" icon="ti-pill"/>
              ))}
            </div>
          }
        </div>
      )}

      {/* ANNUAL */}
      {view==="annual"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <button onClick={()=>setAnnualYear(y=>y-1)}><i className="ti ti-arrow-left" aria-hidden="true"></i></button>
            <span style={{fontWeight:500,minWidth:60,textAlign:"center"}}>{annualYear}</span>
            <button onClick={()=>setAnnualYear(y=>y+1)}><i className="ti ti-arrow-right" aria-hidden="true"></i></button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:24}}>
            <MetricCard label="Total épisodes" value={annualTotal} unit="" icon="ti-bolt"/>
            {annualAvgInt&&<MetricCard label="Intensité moy." value={annualAvgInt} unit="/10" icon="ti-activity"/>}
            <MetricCard label="Mois touchés" value={annualData.filter(m=>m.count>0).length} unit="/12" icon="ti-calendar"/>
          </div>

          <p style={{fontWeight:500,marginBottom:12,fontSize:13}}>Épisodes par mois</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))",gap:8,marginBottom:28}}>
            {annualData.map(({month:m,count,avgInt})=>{
              const isCur=m===month&&annualYear===year;
              return(
                <button key={m} onClick={()=>{setYear(annualYear);setMonth(m);setView("grid");}} style={{
                  padding:"12px 8px",textAlign:"center",borderRadius:"var(--border-radius-md)",
                  border:isCur?"2px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)",
                  background:count>0?intensityColor(avgInt):"var(--color-background-secondary)",cursor:"pointer"
                }}>
                  <div style={{fontSize:11,color:count>0?"#222":"var(--color-text-secondary)",marginBottom:4,fontWeight:500}}>{MONTHS_SHORT[m]}</div>
                  <div style={{fontSize:20,fontWeight:500,color:count>0?"#222":"var(--color-text-tertiary)"}}>{count}</div>
                  {avgInt&&<div style={{fontSize:10,color:"#555",marginTop:2}}>moy. {avgInt}</div>}
                </button>
              );
            })}
          </div>

          <p style={{fontWeight:500,marginBottom:12,fontSize:13}}>Calendrier des épisodes</p>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead>
                <tr>
                  <th style={{width:50,fontSize:11,fontWeight:500,textAlign:"left",padding:"4px 6px",color:"var(--color-text-secondary)"}}>Mois</th>
                  {Array.from({length:31},(_,i)=>(
                    <th key={i} style={{width:20,fontSize:10,fontWeight:400,textAlign:"center",padding:"2px 1px",color:"var(--color-text-tertiary)"}}>{i+1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annualData.map(({month:m,days:d,dayMap})=>(
                  <tr key={m}>
                    <td style={{fontSize:11,fontWeight:500,padding:"3px 6px",color:"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{MONTHS_SHORT[m]}</td>
                    {Array.from({length:31},(_,i)=>{
                      const day=i+1, inMonth=day<=d, ep=inMonth?dayMap[day]:null;
                      const isT=day===today.getDate()&&m===today.getMonth()&&annualYear===today.getFullYear();
                      return(
                        <td key={i} style={{padding:"2px 1px",textAlign:"center"}}>
                          {inMonth?(
                            <div
                              onClick={()=>{if(ep){setYear(annualYear);setMonth(m);setView("grid");}}}
                              onMouseEnter={e=>{if(ep)setTooltip({m,day,ep,x:e.clientX,y:e.clientY});}}
                              onMouseLeave={()=>setTooltip(null)}
                              style={{width:16,height:16,borderRadius:3,margin:"0 auto",background:ep?.intensity?intensityColor(ep.intensity):"var(--color-background-secondary)",border:isT?"1.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)",cursor:ep?"pointer":"default",boxSizing:"border-box"}}
                            />
                          ):<div style={{width:16,height:16}}/>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>Intensité :</span>
            {[["1–3","#c0dd97"],["4–5","#FAC775"],["6–7","#F0997B"],["8–10","#E24B4A"]].map(([l,c])=>(
              <span key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"var(--color-text-secondary)"}}>
                <span style={{width:12,height:12,borderRadius:2,background:c,display:"inline-block"}}></span>{l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI */}
      {view==="ai"&&(
        <div>
          <div style={{background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:16}}>
            <p style={{fontWeight:500,marginBottom:4}}>Analyse médicale par Claude</p>
            <p style={{color:"var(--color-text-secondary)",fontSize:12,marginBottom:12,lineHeight:1.6}}>
              Analyse du mois en cours. Si moins de 3 épisodes, l'historique complet est utilisé. Destiné à être relu par votre médecin.
            </p>
            <button onClick={launchAI} disabled={aiLoading} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px"}}>
              {aiLoading?<><i className="ti ti-loader-2" style={{fontSize:16}} aria-hidden="true"></i> Analyse en cours…</>:<><i className="ti ti-brain" style={{fontSize:16}} aria-hidden="true"></i> Lancer l'analyse</>}
            </button>
          </div>
          {aiError&&<div style={{background:"var(--color-background-danger)",border:"0.5px solid var(--color-border-danger)",borderRadius:"var(--border-radius-md)",padding:"12px 16px",color:"var(--color-text-danger)",fontSize:13,marginBottom:12}}>{aiError}</div>}
          {aiResult&&(
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:500,fontSize:14}}>Résultat</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{navigator.clipboard?.writeText(aiResult);showToast("Copié");}} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><i className="ti ti-copy" aria-hidden="true"></i> Copier</button>
                  <button onClick={()=>exportPDF(year,month,data,settings,aiResult)} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><i className="ti ti-file-type-pdf" aria-hidden="true"></i> PDF</button>
                </div>
              </div>
              <div style={{fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap",color:"var(--color-text-primary)"}}>{aiResult}</div>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS */}
      {view==="settings"&&(
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem"}}>
          <p style={{fontWeight:500,marginBottom:12,fontSize:14}}>Médicaments aigus</p>
          {settings.meds.map((m,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <input value={m} onChange={e=>renameMed(i,e.target.value)} style={{flex:1}}/>
              <button onClick={()=>setConfirmDel(i)} style={{color:"var(--color-text-danger)",padding:"6px 10px"}}>
                <i className="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>
          ))}
          <button onClick={addMed} style={{marginTop:4,display:"flex",alignItems:"center",gap:6}}>
            <i className="ti ti-plus" aria-hidden="true"></i> Ajouter
          </button>
          {confirmDel!==null&&(
            <div style={{marginTop:16,padding:"12px",background:"var(--color-background-danger)",border:"0.5px solid var(--color-border-danger)",borderRadius:"var(--border-radius-md)"}}>
              <p style={{color:"var(--color-text-danger)",marginBottom:10,fontSize:13}}>Supprimer « {settings.meds[confirmDel]} » ?</p>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>deleteMed(confirmDel)} style={{color:"var(--color-text-danger)"}}>Confirmer</button>
                <button onClick={()=>setConfirmDel(null)}>Annuler</button>
              </div>
            </div>
          )}

          {isElectron&&(
            <div style={{marginTop:24,paddingTop:16,borderTop:"0.5px solid var(--color-border-tertiary)"}}>
              <p style={{fontWeight:500,marginBottom:8,fontSize:14}}>Dossier de sauvegarde</p>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <code style={{fontSize:11,background:"var(--color-background-secondary)",padding:"4px 8px",borderRadius:"var(--border-radius-md)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dataDir}</code>
                <button onClick={handleChooseDir} style={{display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                  <i className="ti ti-folder-open" aria-hidden="true"></i> Changer
                </button>
              </div>
              <p style={{color:"var(--color-text-secondary)",fontSize:11,marginTop:8,lineHeight:1.6}}>
                Les données sont sauvegardées automatiquement à chaque saisie dans ce dossier sous forme de fichiers JSON.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Note modal */}
      {noteModal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem",width:"min(90vw,400px)"}}>
            <p style={{fontWeight:500,marginBottom:12}}>{MONTHS[month]} {noteModal}</p>
            <textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} rows={5}
              placeholder="Contexte, déclenchants supposés, observations…"
              style={{width:"100%",resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"flex-end"}}>
              <button onClick={()=>setNoteModal(null)}>Annuler</button>
              <button onClick={saveNote} style={{fontWeight:500}}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip&&(
        <div style={{position:"fixed",left:tooltip.x+12,top:tooltip.y-40,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",padding:"6px 10px",fontSize:12,zIndex:300,pointerEvents:"none"}}>
          <strong>{MONTHS[tooltip.m]} {tooltip.day}</strong> — intensité {tooltip.ep.intensity}/10
          {tooltip.ep.duration?` · ${tooltip.ep.duration}h`:""}
          {tooltip.ep.aura?" · aura":""}
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 20px",fontWeight:500,fontSize:13,zIndex:300}}>
          {toast}
        </div>
      )}
    </div>
  );
}

function MetricCard({label,value,unit,icon}){
  return(
    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,color:"var(--color-text-secondary)",fontSize:11,marginBottom:6}}>
        <i className={`ti ${icon}`} style={{fontSize:13}} aria-hidden="true"></i>{label}
      </div>
      <div style={{fontSize:20,fontWeight:500}}>{value}<span style={{fontSize:12,fontWeight:400,color:"var(--color-text-secondary)",marginLeft:3}}>{unit}</span></div>
    </div>
  );
}

function CellInput({row,val,onChange}){
  const s={width:32,height:26,textAlign:"center",fontSize:12,border:"none",background:"transparent",color:"var(--color-text-primary)",cursor:"pointer",padding:0};
  if(row.type==="number")return(<input type="number" min={row.min} max={row.max} value={val} onChange={e=>onChange(e.target.value===""?"":Number(e.target.value))} style={{...s}} placeholder="–"/>);
  if(row.type==="side"){const cycle={"":"1","1":"2","2":""};return <button onClick={()=>onChange(cycle[val]??"")} style={{...s,fontWeight:500,color:val?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{val||"–"}</button>;}
  if(row.type==="bool"||row.type==="medcheck")return(<button onClick={()=>onChange(val?"":true)} style={{...s,color:val?"var(--color-text-success)":"var(--color-text-tertiary)"}} aria-label={val?"Effacer":"Marquer"}>{val?<i className="ti ti-check" style={{fontSize:14}} aria-hidden="true"></i>:<span style={{fontSize:11}}>–</span>}</button>);
  return null;
}
