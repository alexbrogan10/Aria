import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MenuAction {
  type: 'action';
  label: string;
  shortcut?: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface MenuSeparator {
  type: 'separator';
}

export interface MenuSubmenu {
  type: 'submenu';
  label: string;
  icon?: string;
  disabled?: boolean;
  children: MenuItem[];
}

export interface MenuCheckbox {
  type: 'checkbox';
  label: string;
  checked: boolean;
  shortcut?: string;
  onClick: () => void;
}

export type MenuItem = MenuAction | MenuSeparator | MenuSubmenu | MenuCheckbox;

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ─── Single dropdown item ─────────────────────────────────────────────────────
function DropdownItem({
  item, depth = 0, onClose,
}: { item: MenuItem; depth?: number; onClose: () => void }) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (item.type === 'separator') {
    return <div style={S.separator} />;
  }

  if (item.type === 'submenu') {
    return (
      <div ref={ref}
        style={{ position: 'relative' }}
        onMouseEnter={() => setSubmenuOpen(true)}
        onMouseLeave={() => setSubmenuOpen(false)}>
        <div style={{ ...S.item, ...(item.disabled ? S.itemDisabled : {}) }}>
          {item.icon && <span style={S.itemIcon}>{item.icon}</span>}
          <span style={S.itemLabel}>{item.label}</span>
          <span style={S.submenuArrow}>›</span>
        </div>
        {submenuOpen && !item.disabled && (
          <div style={{ ...S.dropdown, ...S.submenuPanel }}>
            {item.children.map((child, i) => (
              <DropdownItem key={i} item={child} depth={depth + 1} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'checkbox') {
    return (
      <div style={S.item} onClick={() => { item.onClick(); onClose(); }}>
        <span style={S.itemIcon}>{item.checked ? '✓' : ' '}</span>
        <span style={S.itemLabel}>{item.label}</span>
        {item.shortcut && <span style={S.shortcut}>{item.shortcut}</span>}
      </div>
    );
  }

  // action
  return (
    <div
      style={{ ...S.item, ...(item.disabled ? S.itemDisabled : {}), ...(item.danger ? S.itemDanger : {}) }}
      onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}>
      {item.icon && <span style={S.itemIcon}>{item.icon}</span>}
      <span style={S.itemLabel}>{item.label}</span>
      {item.shortcut && <span style={S.shortcut}>{item.shortcut}</span>}
    </div>
  );
}

// ─── Single top-level menu ────────────────────────────────────────────────────
function TopMenu({ menu, isOpen, onOpen, onClose }: {
  menu: MenuDef; isOpen: boolean;
  onOpen: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        style={{ ...S.menuLabel, ...(isOpen ? S.menuLabelActive : {}) }}
        onClick={() => isOpen ? onClose() : onOpen()}
        onMouseEnter={() => { /* handled by parent for hover-open */ }}>
        {menu.label}
      </div>
      {isOpen && (
        <div style={S.dropdown}>
          {menu.items.map((item, i) => (
            <DropdownItem key={i} item={item} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
export function MenuBar({ menus, left, right }: {
  menus: MenuDef[];
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  return (
    <div style={S.bar}>
      {left}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {menus.map((menu, i) => (
          <TopMenu
            key={menu.label}
            menu={menu}
            isOpen={openIdx === i}
            onOpen={() => setOpenIdx(i)}
            onClose={close}
          />
        ))}
      </div>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex', alignItems: 'center', height: 32,
    background: '#f0efeb', borderBottom: '0.5px solid #ddd',
    fontSize: 12, color: '#333', flexShrink: 0, userSelect: 'none',
    padding: '0 8px',
  },
  menuLabel: {
    padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
    color: '#333', whiteSpace: 'nowrap',
  },
  menuLabelActive: {
    background: '#185FA5', color: 'white',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, zIndex: 9999,
    background: 'white', border: '0.5px solid #d0d0ce',
    borderRadius: 6, minWidth: 220,
    boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
    padding: '4px 0',
  },
  submenuPanel: {
    top: 0, left: '100%', marginLeft: 2,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#1a1a18',
    borderRadius: 3, margin: '0 4px',
    transition: 'background 0.08s',
  },
  itemDisabled: {
    color: '#bbb', cursor: 'default', pointerEvents: 'none',
  },
  itemDanger: {
    color: '#c44',
  },
  itemIcon: {
    width: 16, textAlign: 'center', flexShrink: 0, fontSize: 12,
  },
  itemLabel: {
    flex: 1,
  },
  shortcut: {
    fontSize: 11, color: '#aaa', marginLeft: 16, whiteSpace: 'nowrap',
  },
  submenuArrow: {
    fontSize: 13, color: '#aaa', marginLeft: 8,
  },
  separator: {
    height: 1, background: '#ededea', margin: '4px 0',
  },
};
