import React from 'react';
import { Part, Measure, ScoreElement, NoteElement, RestElement, Clef } from '../types';
import { pitchToStaffPosition, autoStemDirection, getKeyAccidentals, ACCIDENTAL_SYMBOL } from '../utils/music';

// ─── Props ────────────────────────────────────────────────────────────────────
interface StaffProps {
  part: Part; measure: Measure;
  measureIndex: number; systemFirstIndex: number; staffIndex: number;
  x: number; y: number; width: number; staffHeight: number; lineSpacing: number;
  clipId: string; blockHeight: number;
  isSelected: (id: string) => boolean;
  onElementClick: (id: string, e: React.MouseEvent) => void;
  onStaffClick: (partId: string, measureId: string, e: React.MouseEvent) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CLEF_GLYPH: Record<string,string> = { G:'𝄞', F:'𝄢', C:'𝄡' };
const FLAG_COUNT: Record<string,number> = { eighth:1, '16th':2, '32nd':3, '64th':4 };
const BEAT_MAP:   Record<string,number> = {
  whole:4, half:2, quarter:1, eighth:0.5, '16th':0.25, '32nd':0.125, '64th':0.0625 };

// ─── Per-note geometry (computed once, shared by beams AND NoteGlyph) ─────────
interface NoteGeom {
  id: string; ex: number; ny: number;
  nw: number; nh: number;           // notehead half-width / half-height
  dir: 'up'|'down';
  stemX: number;                    // x of stem line
  stemNy: number;                   // y where stem meets notehead
  stemTip: number;                  // y of far end of stem (beam attaches here)
  flags: number;                    // 0=quarter, 1=eighth, 2=16th …
}

// ─── Notehead (bezier rotated ellipse, evenodd hole for open) ─────────────────
function Notehead({ cx,cy,w,h,open,fill }: {
  cx:number;cy:number;w:number;h:number;open:boolean;fill:string;
}) {
  const k=0.5523;
  const ep=(rw:number,rh:number,deg:number)=>{
    const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    const r=(dx:number,dy:number)=>`${(cx+dx*c-dy*s).toFixed(2)},${(cy+dx*s+dy*c).toFixed(2)}`;
    return `M ${r(rw,0)} C ${r(rw,-rh*k)} ${r(rw*k,-rh)} ${r(0,-rh)} C ${r(-rw*k,-rh)} ${r(-rw,-rh*k)} ${r(-rw,0)} C ${r(-rw,rh*k)} ${r(-rw*k,rh)} ${r(0,rh)} C ${r(rw*k,rh)} ${r(rw,rh*k)} ${r(rw,0)} Z`;
  };
  const outer=ep(w,h,-20);
  if(!open) return <path d={outer} fill={fill}/>;
  const inner=ep(w*0.42,h*0.60,28);
  return <path d={`${outer} ${inner}`} fill={fill} fillRule="evenodd"/>;
}

// ─── StaffRenderer ────────────────────────────────────────────────────────────
export function StaffRenderer({
  part, measure, measureIndex, systemFirstIndex, staffIndex,
  x, y, width, staffHeight, lineSpacing:ls, clipId, blockHeight,
  isSelected, onElementClick, onStaffClick,
}: StaffProps) {
  const clef     = measure.clefs?.[staffIndex] ?? part.clefs[staffIndex] ?? part.clefs[0];
  const clefSign = (clef?.sign ?? 'G') as 'G'|'F'|'C';
  const isFirst  = measureIndex === systemFirstIndex;
  const firstM   = part.measures[0];
  const ks = isFirst ? (measure.keySignature ?? firstM?.keySignature ?? null) : null;
  const ts = isFirst ? (measure.timeSignature ?? firstM?.timeSignature ?? null) : null;

  // Header
  let hx = x+ls*0.5;
  const clefX=hx; if(isFirst) hx+=ls*4;
  const keyAccs = ks ? getKeyAccidentals(ks.fifths) : [];
  const keyX=hx; if(isFirst&&keyAccs.length) hx+=keyAccs.length*ls*1.3+ls;
  const timeX=hx; if(isFirst&&ts) hx+=ls*3.2;
  hx+=ls*1.4;
  const contentX=hx, contentW=Math.max(ls*3, x+width-hx-ls);

  // Beat layout
  const totalBeats=measure.elements.reduce((s,el)=>
    s+(BEAT_MAP[el.duration.value]??1)*(el.duration.dots?1.5:1),0)||4;
  let cur=contentX;
  const positions=measure.elements.map(el=>{
    const beats=(BEAT_MAP[el.duration.value]??1)*(el.duration.dots?1.5:1);
    const ex=cur; cur+=(beats/totalBeats)*contentW;
    return {el,ex};
  });

  const midY=y+ls*2, staffH=ls*4, sw=Math.max(0.5,ls*0.13);
  const spToY=(sp:number)=>midY-sp*(ls/2);

  // ── Pre-compute geometry for every note ─────────────────────────────────────
  // Notehead size scales with ls but is capped so it always fits inside the block
  const NW = Math.min(ls*0.72, blockHeight*0.12);  // half-width
  const NH = Math.min(ls*0.50, blockHeight*0.08);  // half-height
  // Stem length capped to block headroom
  const STEM_LEN = Math.min(ls*3.5, blockHeight*0.28);

  const geomMap = new Map<string,NoteGeom>();
  // Pass 1: compute geometry with individual stem tips
  positions.forEach(({el,ex})=>{
    if(el.type!=='note') return;
    const note=el as NoteElement;
    const sp   = pitchToStaffPosition(note.pitch, clefSign);
    const ny   = spToY(sp);
    const dir  = (note.stem==='up'||note.stem==='down') ? note.stem : autoStemDirection(sp);
    const stemX  = dir==='up' ? ex+NW : ex-NW;
    const stemNy = dir==='up' ? ny-NH*0.5 : ny+NH*0.5;
    const stemTip= dir==='up' ? ny-STEM_LEN : ny+STEM_LEN;
    geomMap.set(note.id,{
      id:note.id, ex, ny, nw:NW, nh:NH, dir, stemX, stemNy, stemTip,
      flags: FLAG_COUNT[note.duration.value]??0,
    });
  });

  // ── Beam groups ──────────────────────────────────────────────────────────────
  // Key rules:
  //  • Any consecutive beamable notes with the same stem direction share a group
  //  • Different flag counts in the same group → partial beams for extras
  //    (e.g. dotted-eighth + sixteenth: 1 shared beam, 16th gets a partial 2nd beam)
  //  • A rest or quarter/longer note breaks the group
  interface BeamGroup { notes:NoteGeom[]; dir:'up'|'down'; maxFlags:number; }
  const beamGroups: BeamGroup[] = [];
  let cur2: BeamGroup|null = null;

  positions.forEach(({el})=>{
    if(el.type!=='note'){ cur2=null; return; }
    const g=geomMap.get(el.id)!;
    if(!g.flags){ cur2=null; return; }
    if(!cur2 || cur2.dir!==g.dir){ cur2={notes:[],dir:g.dir,maxFlags:0}; beamGroups.push(cur2); }
    cur2.notes.push(g);
    cur2.maxFlags=Math.max(cur2.maxFlags,g.flags);
  });

  const inBeam=new Set<string>();
  beamGroups.forEach(bg=>{ if(bg.notes.length>=2) bg.notes.forEach(n=>inBeam.add(n.id)); });

  // Pass 2: for each multi-note beam group, compute a sloped beam line
  // so all stems meet the beam at the correct height (engraving standard).
  // Rule: the note whose preliminary stemTip is most extreme keeps STEM_LEN.
  // All other stems extend to the interpolated beam line (linear slope).
  // Max slope: 1 staff space per 4 notes to keep beams readable.
  beamGroups.forEach(bg=>{
    if(bg.notes.length < 2) return;
    const first = bg.notes[0], last = bg.notes[bg.notes.length-1];
    const dir   = bg.dir;

    // Preliminary tip of first and last note
    const t0 = first.stemTip, t1 = last.stemTip;
    const dx  = last.stemX - first.stemX;

    // Clamp slope: max 1 staff-space (ls/2 in px) over the whole group
    const maxSlope = (ls * 0.5);
    const rawSlope = dx !== 0 ? (t1 - t0) / dx : 0;
    const clampedSlope = Math.max(-maxSlope/dx, Math.min(maxSlope/dx, rawSlope)) * dx;
    // Adjust t0 so the "most extreme" stem keeps its minimum length
    // For up-stems: most extreme tip = lowest (smallest y = furthest up)
    // For down-stems: most extreme tip = highest (largest y = furthest down)
    const tipLine = (stemX: number) => t0 + (dx !== 0 ? clampedSlope * (stemX - first.stemX) / dx : 0);

    // Ensure every note has at least STEM_LEN from its notehead to the beam
    // Find the note that would need the longest stem given the beam line
    let minRoom = Infinity;
    bg.notes.forEach(n => {
      const beamY  = tipLine(n.stemX);
      const room   = dir === 'up' ? n.ny - beamY : beamY - n.ny;
      minRoom = Math.min(minRoom, room);
    });
    // Shift entire beam line so minimum room = STEM_LEN
    const shift = STEM_LEN - minRoom;
    const adjustedTip = (stemX: number) =>
      tipLine(stemX) + (dir === 'up' ? -shift : shift);

    // Apply adjusted tip to each note in group
    bg.notes.forEach(n => {
      const newTip = adjustedTip(n.stemX);
      const updated: NoteGeom = { ...n, stemTip: newTip };
      geomMap.set(n.id, updated);
      // Also update the reference in bg.notes so beam rendering uses new values
      const idx = bg.notes.indexOf(n);
      bg.notes[idx] = updated;
    });
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  const bh  = Math.max(ls*0.5,2.5);   // beam bar thickness
  const bgap= Math.max(ls*0.4,2.0);   // gap between stacked beams

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y-ls*2.5} width={width} height={blockHeight}/>
        </clipPath>
      </defs>

      {/* Staff lines */}
      {[0,1,2,3,4].map(i=>(
        <line key={i} x1={x} y1={y+i*ls} x2={x+width} y2={y+i*ls}
          stroke="#3a3a38" strokeWidth={Math.max(0.4,ls*0.1)}/>
      ))}

      {/* Clef */}
      {isFirst&&<text x={clefX} y={y+ls*(clefSign==='F'?2.9:3.9)}
        fontSize={ls*(clefSign==='F'?3.6:4.6)} fill="#1a1a18" fontFamily="serif"
        style={{userSelect:'none'}}>{CLEF_GLYPH[clefSign]}</text>}

      {/* Key sig */}
      {isFirst&&keyAccs.map((acc,i)=>{
        const sp=pitchToStaffPosition({step:acc.step,octave:clefSign==='F'?4:5,accidental:acc.accidental,alter:0},clefSign);
        return <text key={i} x={keyX+i*ls*1.3} y={spToY(sp)+ls*0.55}
          fontSize={ls*1.8} fill="#1a1a18" fontFamily="serif" style={{userSelect:'none'}}>
          {ACCIDENTAL_SYMBOL[acc.accidental!]??''}</text>;
      })}

      {/* Time sig */}
      {isFirst&&ts&&<g>
        <text x={timeX+ls*0.3} y={y+ls*1.6} fontSize={ls*2.1} fontWeight={700} fill="#1a1a18" style={{userSelect:'none'}}>{ts.beats}</text>
        <text x={timeX+ls*0.3} y={y+ls*3.6} fontSize={ls*2.1} fontWeight={700} fill="#1a1a18" style={{userSelect:'none'}}>{ts.beatType}</text>
      </g>}

      {/* Barline */}
      <line x1={x+width} y1={y} x2={x+width} y2={y+staffH}
        stroke="#3a3a38" strokeWidth={Math.max(0.5,ls*0.15)}/>

      {/* Click zone */}
      <rect x={contentX} y={y-ls} width={contentW} height={staffH+ls*2}
        fill="transparent" style={{cursor:'crosshair'}}
        onClick={e=>onStaffClick(part.id,measure.id,e)}/>

      {/* Clipped: beams, notes, rests */}
      <g clipPath={`url(#${clipId})`}>

        {/* Beams */}
        {beamGroups.map((bg,gi)=>{
          if(bg.notes.length<2) return null;
          return (
            <g key={gi}>
              {Array.from({length:bg.maxFlags},(_,beamIdx)=>{
                // Collect contiguous segments that participate at this beam level
                const segs: NoteGeom[][] = [];
                let seg: NoteGeom[] = [];
                bg.notes.forEach(n=>{
                  if(n.flags>beamIdx){ seg.push(n); }
                  else { if(seg.length) segs.push(seg); seg=[]; }
                });
                if(seg.length) segs.push(seg);

                return segs.map((seg,si)=>{
                  // Offset: stack beams along stem direction away from notehead
                  const sd   = bg.dir==='up' ? 1 : -1;
                  const off  = beamIdx*(bh+bgap)*sd;

                  if(seg.length===1){
                    // Partial beam — short bar from the lone note toward its neighbour
                    const n    = seg[0];
                    const nIdx = bg.notes.indexOf(n);
                    const next = bg.notes[nIdx+1], prev = bg.notes[nIdx-1];
                    const neighbour = next ?? prev;
                    const partW = Math.max(ls*1.5, STEM_LEN*0.3);
                    const x1   = n.stemX;
                    const x2   = neighbour
                      ? n.stemX + (neighbour.stemX>n.stemX ? partW : -partW)
                      : n.stemX + partW;
                    const ty   = n.stemTip+off;
                    return <polygon key={`${gi}-${si}`}
                      points={bg.dir==='up'
                        ? `${x1},${ty} ${x2},${ty} ${x2},${ty+bh} ${x1},${ty+bh}`
                        : `${x1},${ty} ${x2},${ty} ${x2},${ty-bh} ${x1},${ty-bh}`}
                      fill="#1a1a18"/>;
                  }

                  // Full beam across all notes in segment
                  const f=seg[0], l=seg[seg.length-1];
                  const ay=f.stemTip+off, by=l.stemTip+off;
                  return <polygon key={`${gi}-${si}`}
                    points={bg.dir==='up'
                      ? `${f.stemX},${ay} ${l.stemX},${by} ${l.stemX},${by+bh} ${f.stemX},${ay+bh}`
                      : `${f.stemX},${ay} ${l.stemX},${by} ${l.stemX},${by-bh} ${f.stemX},${ay-bh}`}
                    fill="#1a1a18"/>;
                });
              })}
            </g>
          );
        })}

        {/* Notes & rests */}
        {positions.map(({el})=>{
          const sel=isSelected(el.id);
          const ink=sel?'#185FA5':'#1a1a18';
          if(el.type==='note'){
            const note=el as NoteElement;
            const g=geomMap.get(note.id)!;
            const isWhole=note.duration.value==='whole';
            const isHalf =note.duration.value==='half';
            return (
              <g key={note.id} onClick={e=>{e.stopPropagation();onElementClick(note.id,e);}} style={{cursor:'pointer'}}>
                {sel&&<rect x={g.ex-ls*1.2} y={Math.min(g.ny,g.stemTip)-ls*0.8}
                  width={ls*3.2} height={Math.abs(g.ny-g.stemTip)+ls*2.2}
                  rx={ls*0.35} fill="#E6F1FB" opacity={0.55}/>}

                {/* Ledger lines — derive staff position from ny */}
                {(()=>{
                  const sp=Math.round((midY-g.ny)/(ls*0.5));
                  const lines: number[]=[];
                  if(sp>=6)  for(let p=6; p<=sp; p+=2) lines.push(p);
                  if(sp<=-6) for(let p=-6;p>=sp;p-=2) lines.push(p);
                  return lines.map(p=>(
                    <line key={p} x1={g.ex-NW*1.3} y1={spToY(p)} x2={g.ex+NW*1.3} y2={spToY(p)}
                      stroke="#3a3a38" strokeWidth={Math.max(0.5,ls*0.12)}/>
                  ));
                })()}

                {/* Accidental */}
                {note.pitch.accidental&&(
                  <text x={g.ex-ls*1.65} y={g.ny+ls*0.5} fontSize={ls*1.95}
                    fill={ink} fontFamily="Georgia,serif" style={{userSelect:'none'}}>
                    {ACCIDENTAL_SYMBOL[note.pitch.accidental]}
                  </text>
                )}

                {/* Notehead */}
                <Notehead cx={g.ex} cy={g.ny} w={NW} h={NH}
                  open={isWhole||isHalf} fill={ink}/>

                {/* Dots */}
                {note.duration.dots>=1&&<circle cx={g.ex+NW*1.75} cy={g.ny-ls*0.15} r={Math.max(0.9,ls*0.22)} fill={ink}/>}
                {note.duration.dots>=2&&<circle cx={g.ex+NW*2.35} cy={g.ny-ls*0.15} r={Math.max(0.9,ls*0.22)} fill={ink}/>}

                {/* Stem */}
                {!isWhole&&(
                  <line x1={g.stemX} y1={g.stemNy} x2={g.stemX} y2={g.stemTip}
                    stroke={ink} strokeWidth={Math.max(0.7,ls*0.13)} strokeLinecap="square"/>
                )}

                {/* Flags (unbeamed notes only) */}
                {g.flags>0&&!inBeam.has(note.id)&&Array.from({length:g.flags},(_,i)=>{
                  const fy=g.dir==='up'
                    ? g.stemTip+i*ls*1.0
                    : g.stemTip-i*ls*1.0;
                  const curl=ls*1.8;
                  const d=g.dir==='up'
                    ? `M ${g.stemX} ${fy} C ${g.stemX+curl} ${fy+ls*0.5} ${g.stemX+curl} ${fy+ls*1.8} ${g.stemX+ls*0.2} ${fy+ls*2.2}`
                    : `M ${g.stemX} ${fy} C ${g.stemX+curl} ${fy-ls*0.5} ${g.stemX+curl} ${fy-ls*1.8} ${g.stemX+ls*0.2} ${fy-ls*2.2}`;
                  return <path key={i} d={d} stroke={ink}
                    strokeWidth={Math.max(0.8,ls*0.15)} fill="none" strokeLinecap="round"/>;
                })}

                {/* Articulations */}
                {note.articulations.includes('staccato')&&(
                  <circle cx={g.ex} cy={g.dir==='up'?g.ny+ls*1.4:g.ny-ls*1.4}
                    r={Math.max(1,ls*0.22)} fill={ink}/>
                )}
                {note.articulations.includes('accent')&&(
                  <path d={`M ${g.ex-ls*0.8} ${g.dir==='up'?g.ny+ls*1.4:g.ny-ls*1.4} L ${g.ex} ${g.dir==='up'?g.ny+ls*2:g.ny-ls*2} L ${g.ex-ls*0.8} ${g.dir==='up'?g.ny+ls*2.6:g.ny-ls*2.6}`}
                    stroke={ink} strokeWidth={sw*1.1} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                )}
                {note.articulations.includes('tenuto')&&(
                  <line x1={g.ex-ls*0.75} y1={g.dir==='up'?g.ny+ls*1.5:g.ny-ls*1.5}
                        x2={g.ex+ls*0.75} y2={g.dir==='up'?g.ny+ls*1.5:g.ny-ls*1.5}
                    stroke={ink} strokeWidth={Math.max(0.8,ls*0.16)} strokeLinecap="round"/>
                )}
                {note.articulations.includes('fermata')&&(
                  <text x={g.ex-ls*0.65} y={g.dir==='up'?g.ny-ls*5.2:g.ny+ls*3.2}
                    fontSize={ls*2.3} fill={ink} style={{userSelect:'none'}}>𝄐</text>
                )}
                {note.articulations.includes('trill')&&(
                  <text x={g.ex-ls*0.3} y={g.ny-ls*4.8}
                    fontSize={ls*1.9} fill={ink} fontStyle="italic" style={{userSelect:'none'}}>tr</text>
                )}
              </g>
            );
          }

          if(el.type==='rest'){
            const rest=el as RestElement;
            const ex=positions.find(p=>p.el===el)!.ex;
            const rink=sel?'#185FA5':'#555';
            return (
              <g key={rest.id} onClick={e=>{e.stopPropagation();onElementClick(rest.id,e);}} style={{cursor:'pointer'}}>
                {sel&&<rect x={ex-ls*1.2} y={midY-ls*2.5} width={ls*3} height={ls*5}
                  rx={ls*0.3} fill="#E6F1FB" opacity={0.55}/>}
                {rest.duration.value==='whole'&&(
                  <rect x={ex-ls*0.9} y={y+ls*3} width={ls*1.8} height={ls*0.62} rx={ls*0.06} fill={rink}/>
                )}
                {rest.duration.value==='half'&&(
                  <rect x={ex-ls*0.9} y={y+ls*2-ls*0.62} width={ls*1.8} height={ls*0.62} rx={ls*0.06} fill={rink}/>
                )}
                {rest.duration.value==='quarter'&&(
                  <g stroke={rink} strokeWidth={Math.max(0.7,ls*0.14)} fill="none" strokeLinecap="round">
                    <line x1={ex-ls*0.4} y1={midY-ls*1.4} x2={ex+ls*0.5} y2={midY-ls*1.4}/>
                    <line x1={ex+ls*0.5} y1={midY-ls*1.4} x2={ex-ls*0.5} y2={midY}/>
                    <line x1={ex-ls*0.5} y1={midY} x2={ex+ls*0.3} y2={midY+ls*0.5}/>
                    <path d={`M ${ex+ls*0.3} ${midY+ls*0.5} C ${ex+ls*1.2} ${midY+ls*0.5} ${ex+ls*1} ${midY+ls*1.8} ${ex-ls*0.2} ${midY+ls*1.4}`}
                      strokeWidth={Math.max(0.9,ls*0.17)}/>
                  </g>
                )}
                {rest.duration.value==='eighth'&&(
                  <g>
                    <line x1={ex} y1={midY+ls*0.8} x2={ex} y2={midY-ls*1.8}
                      stroke={rink} strokeWidth={Math.max(0.7,ls*0.14)}/>
                    <circle cx={ex} cy={midY+ls*0.8} r={Math.max(1.2,ls*0.32)} fill={rink}/>
                    <path d={`M ${ex} ${midY-ls*1.8} C ${ex+ls*1.3} ${midY-ls*0.8} ${ex+ls*1.2} ${midY+ls*0.2} ${ex+ls*0.3} ${midY+ls*0.5}`}
                      stroke={rink} strokeWidth={Math.max(0.7,ls*0.14)} fill="none" strokeLinecap="round"/>
                  </g>
                )}
                {rest.duration.value==='16th'&&(
                  <g>
                    <line x1={ex} y1={midY+ls*0.8} x2={ex} y2={midY-ls*2.6}
                      stroke={rink} strokeWidth={Math.max(0.7,ls*0.13)}/>
                    <circle cx={ex} cy={midY+ls*0.8} r={Math.max(1.2,ls*0.30)} fill={rink}/>
                    <circle cx={ex+ls*0.5} cy={midY-ls*0.5} r={Math.max(1.2,ls*0.30)} fill={rink}/>
                    <path d={`M ${ex} ${midY-ls*1.8} C ${ex+ls*1.2} ${midY-ls*1} ${ex+ls*1} ${midY} ${ex+ls*0.3} ${midY+ls*0.3}`}
                      stroke={rink} strokeWidth={Math.max(0.7,ls*0.13)} fill="none" strokeLinecap="round"/>
                    <path d={`M ${ex} ${midY-ls*2.6} C ${ex+ls*1.2} ${midY-ls*1.8} ${ex+ls*1} ${midY-ls*0.8} ${ex+ls*0.3} ${midY-ls*0.5}`}
                      stroke={rink} strokeWidth={Math.max(0.7,ls*0.13)} fill="none" strokeLinecap="round"/>
                  </g>
                )}
                {rest.duration.dots>=1&&(
                  <circle cx={ex+ls*1.3} cy={midY-ls*0.5} r={Math.max(0.9,ls*0.2)} fill={rink}/>
                )}
              </g>
            );
          }
          return null;
        })}

        {/* Full-measure rest */}
        {measure.elements.length===0&&(
          <rect x={x+width/2-ls} y={y+ls-ls*0.35} width={ls*2} height={ls*0.6}
            fill="#888780" rx={ls*0.08}/>
        )}
      </g>
    </g>
  );
}
