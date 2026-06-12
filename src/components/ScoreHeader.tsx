import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';

// ─── Editable field ───────────────────────────────────────────────────────────
interface EditableFieldProps {
  value: string;
  placeholder: string;
  style?: React.CSSProperties;
  onSave: (val: string) => void;
  multiline?: boolean;
}

function EditableField({ value, placeholder, style, onSave, multiline }: EditableFieldProps) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(value);
  const [hovered, setHovered]   = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Keep draft in sync if value changes externally
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const startEdit = () => { setDraft(value); setEditing(true); };
  const commit    = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
  }, [draft, value, onSave]);

  const cancel = () => { setEditing(false); setDraft(value); };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    const commonProps = {
      ref: inputRef as any,
      value: draft,
      onChange: (e: React.ChangeEvent<any>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') cancel();
      },
      style: {
        ...style,
        background: 'transparent',
        border: 'none',
        borderBottom: '2px solid #185FA5',
        outline: 'none',
        width: '100%',
        textAlign: 'center' as const,
        padding: '2px 4px',
        fontFamily: 'inherit',
        resize: 'none' as const,
      },
    };
    return multiline
      ? <textarea {...commonProps} rows={2} />
      : <input    {...commonProps} />;
  }

  const isEmpty = !value;
  return (
    <div
      onClick={startEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        cursor: 'text',
        borderBottom: hovered ? '1.5px dashed #B5D4F4' : '1.5px solid transparent',
        padding: '2px 4px',
        transition: 'border-color 0.15s',
        color: isEmpty ? '#ccc' : style?.color,
        minWidth: 120,
        display: 'inline-block',
      }}
      title="Click to edit">
      {isEmpty ? placeholder : value}
      {hovered && !isEmpty && (
        <span style={{ fontSize: 10, color: '#B5D4F4', marginLeft: 4, verticalAlign: 'middle' }}>✎</span>
      )}
    </div>
  );
}

// ─── Score Header ─────────────────────────────────────────────────────────────
export function ScoreHeader() {
  const { state, dispatch } = useStore();
  const { score }           = state;
  const [showAllFields, setShowAllFields] = useState(false);

  const setTitle    = (title: string)    => dispatch({ type: 'SET_TITLE',    title });
  const setComposer = (composer: string) => dispatch({ type: 'SET_COMPOSER', composer });
  const setSubtitle = (subtitle: string) => {
    const newScore = { ...score, metadata: { ...score.metadata, subtitle } };
    dispatch({ type: 'LOAD_SCORE', score: newScore });
  };
  const setLyricist = (lyricist: string) => {
    const newScore = { ...score, metadata: { ...score.metadata, lyricist } };
    dispatch({ type: 'LOAD_SCORE', score: newScore });
  };
  const setCopyright = (copyright: string) => {
    const newScore = { ...score, metadata: { ...score.metadata, copyright } };
    dispatch({ type: 'LOAD_SCORE', score: newScore });
  };

  const hasSubtitle  = !!score.metadata.subtitle;
  const hasLyricist  = !!score.metadata.lyricist;
  const hasCopyright = !!score.metadata.copyright;

  return (
    <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>

      {/* Title */}
      <EditableField
        value={score.metadata.title}
        placeholder="Score Title"
        onSave={setTitle}
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: '#1a1a18', display: 'block', width: '100%' }}
      />

      {/* Subtitle / Movement */}
      {(hasSubtitle || showAllFields) && (
        <EditableField
          value={score.metadata.subtitle ?? ''}
          placeholder="Subtitle / Movement"
          onSave={setSubtitle}
          style={{ fontSize: 14, color: '#555', marginTop: 2, display: 'block', width: '100%' }}
        />
      )}

      {/* Composer + Lyricist row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
        {/* Lyricist (left) */}
        <div style={{ flex: 1, textAlign: 'left' }}>
          {(hasLyricist || showAllFields) && (
            <EditableField
              value={score.metadata.lyricist ?? ''}
              placeholder="Lyricist"
              onSave={setLyricist}
              style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}
            />
          )}
        </div>

        {/* Composer (right) */}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <EditableField
            value={score.metadata.composer ?? ''}
            placeholder="Composer"
            onSave={setComposer}
            style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}
          />
        </div>
      </div>

      {/* Tempo marking */}
      {score.globalTempo.text && (
        <div style={{ textAlign: 'left', marginTop: 6, fontSize: 12, fontStyle: 'italic', color: '#444' }}>
          <EditableField
            value={score.globalTempo.text}
            placeholder="Tempo marking"
            onSave={text => dispatch({ type: 'SET_TEMPO', bpm: score.globalTempo.bpm, text })}
            style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}
          />
          <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
            (♩ = {score.globalTempo.bpm})
          </span>
        </div>
      )}

      {/* Copyright */}
      {(hasCopyright || showAllFields) && (
        <EditableField
          value={score.metadata.copyright ?? ''}
          placeholder="© Copyright"
          onSave={setCopyright}
          style={{ fontSize: 10, color: '#aaa', marginTop: 4, display: 'block', width: '100%' }}
        />
      )}

      {/* Toggle extra fields */}
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <button
          onClick={() => setShowAllFields(v => !v)}
          title={showAllFields ? 'Hide optional fields' : 'Add subtitle, lyricist, copyright…'}
          style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            border: '0.5px solid #ddd', background: '#fafaf8',
            cursor: 'pointer', color: '#aaa',
          }}>
          {showAllFields ? '− Less' : '+ More fields'}
        </button>
      </div>
    </div>
  );
}
