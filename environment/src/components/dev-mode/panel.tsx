import { useDevMode } from '@/lib/devMode';
import { lookupToken } from './extractMeta';

const TEXT_KEYS = [
  'color',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
];

const COLOR_KEYS: Array<[string, string]> = [
  ['color', 'text'],
  ['backgroundColor', 'background'],
  ['borderColor', 'border'],
];

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
}

function isInvisible(v: string | undefined): boolean {
  if (!v) return true;
  if (v === 'transparent' || v === 'none') return true;
  const m = v.match(/rgba?\([^)]+\)/);
  if (m && /,\s*0\s*\)/.test(m[0])) return true;
  return false;
}

function px(v: string | undefined) {
  if (!v) return '-';
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n).toString() : v;
}

function copy(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function Card({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #E5E7EB',
          fontSize: 12,
          fontWeight: 600,
          color: '#374151',
        }}
      >
        <span>{title}</span>
        {copyText && (
          <button
            onClick={() => copy(copyText)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              border: '1px solid #D1D5DB',
              borderRadius: 4,
              background: 'white',
              cursor: 'pointer',
            }}
          >
            copy
          </button>
        )}
      </div>
      <div style={{ padding: 12, fontSize: 12, fontFamily: 'monospace', color: '#111827' }}>
        {children}
      </div>
    </div>
  );
}

export function DevPanel() {
  const selected = useDevMode((s) => s.selected);
  const setSelected = useDevMode((s) => s.setSelected);
  if (!selected) return null;
  const s = selected.styles;
  const w = Math.round(selected.rect.width);
  const h = Math.round(selected.rect.height);
  const textBlock = TEXT_KEYS.filter((k) => s[k])
    .map((k) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${s[k]}`)
    .join('\n');
  return (
    <div
      data-dev-overlay="panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 320,
        height: '100vh',
        background: 'white',
        borderLeft: '1px solid #E5E7EB',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
        zIndex: 9997,
        overflowY: 'auto',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>Dev Inspect</div>
        <button
          onClick={() => setSelected(null)}
          style={{
            fontSize: 14,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          x
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12, wordBreak: 'break-all' }}>
        <div>{selected.path}</div>
        {selected.source && <div style={{ color: '#0891B2' }}>{selected.source}</div>}
      </div>
      <Card title="Code" copyText={selected.html}>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {selected.html}
        </pre>
      </Card>
      <Card title="Text Styles" copyText={textBlock}>
        {TEXT_KEYS.map((k) =>
          s[k] ? (
            <div key={k}>
              {k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: {s[k]}
            </div>
          ) : null
        )}
      </Card>
      <Card title="Layer properties">
        <div style={{ textAlign: 'center', color: '#6B7280', marginBottom: 4 }}>
          {px(s.paddingTop)} padding {px(s.paddingTop)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#6B7280' }}>{px(s.paddingLeft)}</span>
          <div
            style={{
              flex: 1,
              border: `${px(s.borderTopWidth)}px solid ${s.borderColor || '#D1D5DB'}`,
              borderRadius: 6,
              padding: 8,
              textAlign: 'center',
              color: '#111827',
              background: '#F9FAFB',
            }}
          >
            {w} x {h}
          </div>
          <span style={{ color: '#6B7280' }}>{px(s.paddingRight)}</span>
        </div>
        <div style={{ textAlign: 'center', color: '#6B7280', marginTop: 4 }}>
          {px(s.paddingBottom)}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#6B7280' }}>
          radius: {px(s.borderTopLeftRadius)} {px(s.borderTopRightRadius)} {px(s.borderBottomRightRadius)} {px(s.borderBottomLeftRadius)}
        </div>
      </Card>
      {(selected.icon.muiName || selected.icon.isInlineNonMuiSvg || selected.icon.isAssetImg) && (
        <Card title="Icon" copyText={selected.icon.muiName ?? selected.icon.imgSrc ?? ''}>
          {selected.icon.muiName && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>OK</span>
                <span style={{ fontSize: 11, color: '#6B7280' }}>MUI icon</span>
              </div>
              <div style={{ color: '#0891B2', wordBreak: 'break-all' }}>{selected.icon.muiName}</div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                import {`{`} {selected.icon.muiName} {`}`} from{`\n`}'@mui/icons-material/{selected.icon.muiName.replace(/Icon$/, '')}'
              </div>
            </>
          )}
          {selected.icon.isInlineNonMuiSvg && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>!</span>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Inline SVG</span>
              </div>
              <div style={{ fontSize: 11, color: '#92400E' }}>
                Consider replacing with an icon from @mui/icons-material.
              </div>
            </>
          )}
          {selected.icon.isAssetImg && !selected.icon.muiName && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>OK</span>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Asset image</span>
              </div>
              <div style={{ color: '#0891B2', wordBreak: 'break-all' }}>{selected.icon.imgSrc}</div>
            </>
          )}
        </Card>
      )}
      <Card title="Colors">
        {COLOR_KEYS.map(([key, label]) => {
          const v = s[key];
          if (isInvisible(v)) return null;
          const hex = rgbToHex(v);
          const token = lookupToken(v);
          return (
            <div
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: v,
                  border: '1px solid #E5E7EB',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{label}</span>
                {token ? (
                  <span style={{ fontSize: 12, color: '#0891B2' }}>{token}</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                    <span style={{ background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>!</span>
                    <span style={{ color: '#92400E' }}>off-system literal</span>
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#6B7280' }}>{hex ?? v}</span>
              </div>
            </div>
          );
        })}
        {COLOR_KEYS.every(([k]) => isInvisible(s[k])) && (
          <span style={{ color: '#9CA3AF' }}>no colors</span>
        )}
      </Card>
    </div>
  );
}
