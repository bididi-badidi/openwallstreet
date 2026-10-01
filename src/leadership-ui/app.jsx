import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import EventCard from './EventCard.jsx';
import { DAY_MS, PIXELS_PER_DAY, projectTimeline, makeTicks, visibleMonthLabels, visibleEventPoints } from './timeline-geometry.js';
import model from './evidence-model.json';
import './style.css';
import './disclosure.css';

const events = model.events;
// Month starts are layout anchors, not asserted occurrence dates. The annual
// outcome uses its period-end month while retaining the full-year label.
const startTime = Date.parse(events[0].month+'-01T00:00:00Z');
const points = events.map(e => (Date.parse(e.month+'-01T00:00:00Z') - startTime) / DAY_MS * PIXELS_PER_DAY);
const ticks = makeTicks(startTime, Date.parse(events.at(-1).month+'-01T00:00:00Z')).filter(t => t.major || t.week);
const monthTicks = ticks.filter(t => t.major);
const rootElement = document.getElementById('alphabet-refined');

const iconPaths = {
  'chevron-left': 'm15 18-6-6 6-6', 'chevron-right': 'm9 18 6-6-6-6',
  'chevron-down': 'm6 9 6 6 6-6', 'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  x: 'm6 6 12 12M6 18 18 6', info: 'M12 11v6M12 7h.01',
  'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h8',
};
function Icon({name, className=''}) {
  return <span className={'ws-icon '+className} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{name==='info' && <circle cx="12" cy="12" r="10"/>}<path d={iconPaths[name]}/></svg></span>;
}
function SourceQuote({reference, roles}) {
  const e = model.evidence[reference];
  const [open,setOpen] = useState(false);
  const id=React.useId();
  return <div className="source-record t-acc" data-open={open}>
    <button className="source-heading t-acc-head" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
      <span><span className="source-label">FY{e.report_year} ANNUAL REPORT</span><span className="source-title">{e.section}</span><span className="source-page">Physical page {e.page} · {e.attribution || "Attribution not specified"}</span></span><span className="t-acc-chevron"><Icon name="chevron-down"/></span>
    </button>
    <div className="t-acc-panel" id={id} aria-hidden={!open} inert={!open}><div className="t-acc-panel-inner"><div className="quote-content">
      <p className="small-note">Physical PDF page; table headers and measurement periods remain in the full page below.</p>
      <p className="small-note">{roles?.join(" · ")}</p><blockquote>{e.excerpt}</blockquote><a className="source-out" href={e.source_url} target="_blank" rel="noopener noreferrer">Open original page <Icon name="arrow-up-right"/></a>
      <span className="quote-check">Exact quote checked against saved source text{e.origin==="separate_offline_source_review" ? " · Separate offline source review" : " · Collector extraction"}</span><details className="saved-page"><summary>Full saved page &amp; provenance</summary><p>{e.snapshot_method} · Record {e.claim_id}</p><pre>{e.source_page_text}</pre></details>
    </div></div></div>
  </div>;
}
function Evidence({item}) {
  if(!item) return null;
  return <div className="evidence-content"><p className="small-note">Interpretation: {item.review_status}. Company evidence does not establish individual contribution.</p><div className="interpretations"><div><span className="detail-label">WHAT IT SUPPORTS</span><p>{item.meaning}</p></div><div><span className="detail-label">WHAT REMAINS UNPROVEN</span><p>{item.limit}</p></div></div><details className="date-support"><summary>How dates are assigned</summary>{item.date_support.map((d,i)=><p key={i}><strong>{d.value} · {d.role}</strong><br/>{d.entry}<br/>{d.basis}</p>)}</details><div className="source-list">{item.refs.map(n=><SourceQuote key={n} reference={n} roles={item.reference_roles[n]}/>)}</div></div>;
}
function useProjection(position, point, width) {
  const projected = useTransform(position,value=>projectTimeline(point+value,width));
  return {x:useTransform(projected,v=>v.x),y:useTransform(projected,v=>v.y),scale:useTransform(projected,v=>v.scale),visibility:useTransform(projected,v=>v.visible?'visible':'hidden')};
}
function Tick({tick,position,width,visibleLabels}) {
  const {x,y,scale,visibility}=useProjection(position,tick.point,width);
  const opacity=useTransform(visibleLabels,value=>value.has(tick.point)?1:0);
  return <motion.div className={'rail-tick '+(tick.major?'major':'week')} style={{x,y,visibility}}><motion.span className="tick-stroke" style={{scaleY:scale}}/>{tick.major && <motion.span className="month-label" style={{opacity}}>{tick.label}</motion.span>}</motion.div>;
}
function TimelineEvent({event,index,active,expanded,select,position,width,reduced,onSize,visiblePoints}) {
  const {x,y,scale}=useProjection(position,points[index],width);
  const visible=useTransform(visiblePoints,value=>value.has(points[index])?'visible':'hidden');
  return <motion.div className="event-anchor" data-active={active} style={{x,y,visibility:visible,zIndex:active?10:2}}><motion.div className="event-depth" style={{scale}}><div className="billboard"><EventCard event={event} index={index} active={active} expanded={expanded} select={select} reduced={reduced} onSize={onSize}/></div><span className="event-stem" aria-hidden="true"/></motion.div><button className="event-dot" aria-label={`Select ${event.date}: ${event.title}`} aria-current={active?'step':undefined} onClick={()=>select(index)}><span/></button></motion.div>;
}

function App() {
  const restored=window.openai?.widgetState?.privateContent||{};
  const initial=events.findIndex(e=>e.id===restored.event);
  const restoredAssessment=model.assessments.find(a=>a.id===restored.assessment);
  const [selected,setSelected]=useState(initial<0?0:initial);
  const [expanded,setExpanded]=useState(null);
  const [phase,setPhase]=useState('moving');
  const [width,setWidth]=useState(736);
  const [maxCardHeight,setMaxCardHeight]=useState(310);
  const [assessment,setAssessment]=useState(restoredAssessment?.id||null);
  const [lastAssessment,setLastAssessment]=useState(restoredAssessment||model.assessments[0]);
  const [sourcesOpen,setSourcesOpen]=useState(Boolean(restored.sourcesOpen));
  const [coverageOpen,setCoverageOpen]=useState(false);
  const viewer=useRef(null);
  const position=useMotionValue(-points[selected]);
  const reduced=useReducedMotion();
  // Compute collision sets once per frame, not once per tick or event.
  const visibleLabels=useTransform(position,value=>visibleMonthLabels(monthTicks,value,width));
  const visiblePoints=useTransform(position,value=>visibleEventPoints(points,value,width));
  const selectedEvent=events[selected];
  const stateRef=useRef({selected,assessment,sourcesOpen});
  stateRef.current={selected,assessment,sourcesOpen};
  const onSize=React.useCallback(size=>setMaxCardHeight(h=>Math.max(h,size.height)),[]);
  function remember(next) {
    const s={...stateRef.current,...next};
    window.openai?.setWidgetState?.({modelContent:{company:'Alphabet',selectedEvent:events[s.selected].id,selectedAssessment:s.assessment},privateContent:{event:events[s.selected].id,assessment:s.assessment,sourcesOpen:s.sourcesOpen}}).catch(()=>{});
  }
  const select=React.useCallback(index=>{
    const next=Math.max(0,Math.min(events.length-1,index));
    if(next===stateRef.current.selected)return;
    setSelected(next);setSourcesOpen(false);remember({selected:next,sourcesOpen:false});
  },[]);
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(viewer.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let cancelled=false,pause;
    setExpanded(null);
    if(reduced){position.jump(-points[selected]);setExpanded(selected);setPhase('expanded');return;}
    setPhase('moving');
    const controls=animate(position,-points[selected],{type:'spring',bounce:0,duration:1.8,onComplete:()=>{if(cancelled)return;setPhase('pause');pause=setTimeout(()=>{if(cancelled)return;setExpanded(selected);setPhase('expanded');},450);}});
    return()=>{cancelled=true;clearTimeout(pause);controls.stop();};
  },[selected,reduced,position]);
  useEffect(()=>{
    const key=e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable]'))return;const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(delta){e.preventDefault();select(stateRef.current.selected+delta);}if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:events.length-1);}};
    const area=viewer.current.parentElement;area.addEventListener('keydown',key);return()=>area.removeEventListener('keydown',key);
  },[select]);
  useEffect(()=>{
    const restore=e=>{const saved=e.detail?.globals?.widgetState?.privateContent;if(!saved)return;const index=events.findIndex(x=>x.id===saved.event);if(index>=0)setSelected(index);const a=model.assessments.find(x=>x.id===saved.assessment);setAssessment(a?.id||null);if(a)setLastAssessment(a);setSourcesOpen(Boolean(saved.sourcesOpen));};
    window.addEventListener('openai:set_globals',restore);return()=>window.removeEventListener('openai:set_globals',restore);
  },[]);
  useEffect(()=>{
    if(!globalThis.Tweak)return;const design={air:'comfortable',depth:true};const apply=()=>{rootElement.dataset.spacing=design.air;rootElement.dataset.depth=String(design.depth);};const tweak=new Tweak({container:rootElement,onChange:apply});tweak.addSelect(design,'air',{label:'Page spacing',options:['comfortable','compact']});tweak.addToggle(design,'depth',{label:'Card shadows'});apply();return()=>tweak.dispose();
  },[]);
  return <div className="ws-app">
    <header className="ws-toolbar"><span className="ws-brand">wallstreet<span className="ws-brand-dot">.</span></span><span className="ws-location">Leadership record</span><span className="ws-vintage">{model.scope} <span>Annual evidence</span></span></header>
    <main>
      <section className="ws-intro"><div className="company-lockup"><span className="company-monogram" aria-hidden="true">A</span><div><span className="company-name">Alphabet</span><span className="company-caption">Board &amp; management</span></div></div><h1>The record behind<br className="mobile-break"/> the leadership.</h1><p className="ws-deck">{model.deck}</p></section>
      <section className="ws-overview" aria-label="Four separate evidence assessments">
        <div className="assessment-grid">{model.assessments.map(a=><motion.button key={a.id} type="button" className="assessment-card t-acc-head" data-assessment={a.id} data-selected={assessment===a.id} aria-expanded={assessment===a.id} aria-controls="assessment-evidence" onClick={()=>{const next=assessment===a.id?null:a.id;setAssessment(next);setLastAssessment(a);remember({assessment:next});}} whileTap={reduced?undefined:{scale:.985}}><span className="assessment-name"><span className="signal unknown"/>{a.name}</span><span className="assessment-value">{a.value}</span><span className="assessment-summary">{a.summary}</span><span className="assessment-proof">{a.caption}<Icon name="arrow-up-right"/></span></motion.button>)}</div>
        <div className="assessment-disclosure t-acc" data-open={!!assessment}><div className="t-acc-panel" id="assessment-evidence" aria-hidden={!assessment} inert={!assessment}><div className="t-acc-panel-inner"><div className="assessment-inspector"><div className="inspector-heading"><h2>{lastAssessment.name}</h2><span>Provisional assessment</span><button className="quiet-button" aria-label="Close assessment evidence" onClick={()=>{rootElement.querySelector(`[data-assessment="${assessment}"]`)?.focus();setAssessment(null);remember({assessment:null});}}><Icon name="x"/></button></div><Evidence key={lastAssessment.id} item={lastAssessment}/></div></div></div></div>
        <p className="overview-note"><Icon name="info"/>Company performance does not establish a director’s individual contribution.</p>
      </section>
      <section className="ws-story" aria-labelledby="story-heading">
        <div className="story-heading"><div><span className="eyebrow">THE DECISIONS. THE CONSEQUENCES.</span><h2 id="story-heading">{model.title}</h2></div><span className="story-count">{events.length} selected milestones</span></div>
        <p className="coverage-status">{model.coverage.filter(c=>c.status!=="collected; review pending").length ? "Coverage gaps: "+model.coverage.filter(c=>c.status!=="collected; review pending").map(c=>`FY${c.year} (${c.status})`).join(" · ") : "Five annual reports collected. Interpretation and guidance-revision review remain open."}</p><section ref={viewer} className="viewer" aria-label="Cinematic evidence timeline" data-phase={phase} data-selected={selectedEvent.id} style={{'--viewer-height':`${Math.max(480,maxCardHeight+170)}px`,'--measured-card-width':`${Math.min(300,Math.max(210,width-56))}px`}}><p className="visually-hidden" aria-live="polite">{selectedEvent.date}. {selectedEvent.title} {expanded===selected?selectedEvent.summary:''}</p><div className="timeline-window"><div className="rail-line" aria-hidden="true"/><div className="projection-origin"><div className="tick-layer" aria-hidden="true">{ticks.map(t=><Tick key={t.point} tick={t} position={position} width={width} visibleLabels={visibleLabels}/>)}</div>{events.map((e,i)=><TimelineEvent key={e.id} event={e} index={i} active={i===selected} expanded={i===expanded} select={select} reduced={reduced} position={position} width={width} onSize={onSize} visiblePoints={visiblePoints}/>)}</div></div></section>
        <nav className="story-controls" aria-label="Timeline navigation"><motion.button id="ws-previous" type="button" className="round-button" aria-label="Previous event" disabled={selected===0} onClick={()=>select(selected-1)} whileTap={reduced?undefined:{scale:.94}}><Icon name="chevron-left"/></motion.button><span className="selected-date">{selectedEvent.date}<span>{selected+1} of {events.length} · {selectedEvent.type}</span></span><motion.button id="ws-next" type="button" className="round-button" aria-label="Next event" disabled={selected===events.length-1} onClick={()=>select(selected+1)} whileTap={reduced?undefined:{scale:.94}}><Icon name="chevron-right"/></motion.button></nav>
        <nav className="year-jumps" aria-label="Jump to a year">{model.coverage.map(c=>{const index=events.findIndex(e=>e.month.startsWith(String(c.year)));return <button key={c.year} type="button" disabled={index<0} aria-current={selectedEvent.month.startsWith(String(c.year))?'date':undefined} onClick={()=>select(index)}>{c.year}</button>;})}</nav><p className="story-hint">Select a year or use the arrow keys · Proposed interpretation</p>
        <div className="event-evidence t-acc" data-open={sourcesOpen}><button className="evidence-trigger t-acc-head" type="button" aria-expanded={sourcesOpen} aria-controls="event-source-panel" onClick={()=>{setSourcesOpen(!sourcesOpen);remember({sourcesOpen:!sourcesOpen});}}><span><Icon name="file-text"/>Evidence &amp; context<span className="evidence-trigger-page">p. {model.evidence[selectedEvent.refs[0]].page}</span></span><span className="t-acc-chevron"><Icon name="chevron-down"/></span></button><div className="t-acc-panel" id="event-source-panel" aria-hidden={!sourcesOpen} inert={!sourcesOpen}><div className="t-acc-panel-inner"><div className="event-inspector"><p className="attribution">{selectedEvent.date_kind} · {selectedEvent.owner}{selectedEvent.decision_by!=="not_applicable" && selectedEvent.decision_by!=="unknown" ? " · Decision: "+selectedEvent.decision_by : ""}{selectedEvent.target_period?' · Target: '+selectedEvent.target_period:''}</p><Evidence key={selectedEvent.id} item={selectedEvent}/></div></div></div></div>
      </section>
      <section className="coverage t-acc" data-open={coverageOpen}><button className="coverage-heading t-acc-head" aria-expanded={coverageOpen} aria-controls="coverage-panel" onClick={()=>setCoverageOpen(!coverageOpen)}><span><span className="coverage-title">A clear record includes its limits.</span><span className="coverage-caption">{model.source_documents} annual reports · {model.extracted_claims} saved excerpts</span></span><span className="t-acc-chevron"><Icon name="chevron-down"/></span></button><div id="coverage-panel" className="t-acc-panel" inert={!coverageOpen} aria-hidden={!coverageOpen}><div className="t-acc-panel-inner"><div className="coverage-body"><p>{model.review} This view selects {events.length} major moments from {model.ledger_entries} normalized entries. {model.uncurated_claims} extracted records still need ledger curation.</p><ul className="coverage-years">{model.coverage.map(c=><li key={c.year}><strong>FY{c.year}</strong><span>{c.status} · {c.collector_excerpts} collected excerpts{c.supplemental_excerpts ? ` + ${c.supplemental_excerpts} source supplement` : ""}</span></li>)}</ul>{model.limitations.map((text,i)=><p key={i}>{text}</p>)}{model.collection_gaps.length>0 && <details><summary>Collection notes ({model.collection_gaps.length})</summary><ul>{model.collection_gaps.map((gap,i)=><li key={i}>{gap}</li>)}</ul></details>}<p><a className="source-out" href="build/ledger.html" target="_blank" rel="noopener noreferrer">Open the full evidence ledger <Icon name="arrow-up-right"/></a></p><p>Individual board profiles need roles, tenure, documented decisions and comparable outcomes. Unknown evidence is not a poor rating.</p><p>Rail positions use month-level anchors. Annual results are anchored at their period end; year-only events at December for layout. Perspective compresses distant time; no exact event day is implied.</p></div></div></div></section>
    </main><footer className="ws-footer"><span>Alphabet · Historical evidence</span><span>Evidence cutoff · {model.as_of}</span></footer>
  </div>;
}
createRoot(rootElement).render(<App/>);
