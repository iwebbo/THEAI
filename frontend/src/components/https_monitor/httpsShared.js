import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
export const FETCH_LIMIT = 500; // maximum accepté par GET /http-synthetic/
export const CERT_WARN_DAYS = 30;
export const CERT_CRIT_DAYS = 7;
export const SLOW_MS = 2000;
export const STALE_HOURS = 24;

export const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
  { hours: 0, label: 'All' }
];

const SLA_TARGETS = [95, 99, 99.5, 99.9];

// Même clé que la page SLA : l'objectif choisi là-bas s'applique ici
export const readSlaTarget = () => {
  try {
    const v = parseFloat(localStorage.getItem('sla_target'));
    return SLA_TARGETS.includes(v) ? v : 99;
  } catch (e) {
    return 99;
  }
};

export const targetPath = (url) => `/https-monitor/target?url=${encodeURIComponent(url)}`;

/* ------------------------------------------------------------------ */
/*  Formatage                                                          */
/* ------------------------------------------------------------------ */
export const errMsg = (err) => {
  const d = err?.response?.data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join('; ');
  if (d && typeof d === 'object') return JSON.stringify(d);
  return d || err.message;
};

// Les dates backend sont en UTC, parfois sans suffixe de fuseau
export const parseUtc = (v) => {
  if (!v) return null;
  const s = String(v);
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (v) => {
  const d = parseUtc(v);
  return d ? d.toLocaleString() : '-';
};

export const timeAgo = (ts, now) => {
  if (!ts) return '-';
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const fmtMs = (v) => (v === null || v === undefined ? '-' : `${Math.round(v)} ms`);

export const checkTs = (c) => {
  const d = parseUtc(c.checked_at);
  return d ? d.getTime() : 0;
};

export const certDays = (c) => {
  const v = c?.cert_days_remaining ?? c?.certificate?.days_remaining;
  return v === null || v === undefined ? null : Number(v);
};

export const certColor = (days) => {
  if (days === null || days === undefined) return 'var(--text-tertiary)';
  if (days <= CERT_CRIT_DAYS) return 'var(--error-500)';
  if (days <= CERT_WARN_DAYS) return '#ca8a04';
  return 'var(--success-500)';
};

export const slaColor = (value, target) => {
  if (value === null || value === undefined) return 'var(--text-tertiary)';
  if (value >= target) return 'var(--success-500)';
  if (value >= target - 1) return '#ca8a04';
  return 'var(--error-500)';
};

export const controlStyle = {
  padding: '0.4rem 0.625rem',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-light)',
  borderRadius: '0.375rem',
  minWidth: 0
};

/* ------------------------------------------------------------------ */
/*  Statuts, alertes                                                   */
/* ------------------------------------------------------------------ */
const STATUS_META = {
  online: { label: 'Online', bg: '#dcfce7', fg: '#166534', color: '#16a34a', rank: 0 },
  warning: { label: 'Warning', bg: '#fef9c3', fg: '#854d0e', color: '#ca8a04', rank: 1 },
  offline: { label: 'Offline', bg: '#fee2e2', fg: '#991b1b', color: '#dc2626', rank: 2 },
  unknown: { label: 'Unknown', bg: '#e5e7eb', fg: '#374151', color: '#9ca3af', rank: 3 }
};

export const statusMeta = (s) => STATUS_META[s] || STATUS_META.unknown;

export const SEVERITY_META = {
  critical: { bg: '#fee2e2', fg: '#991b1b', rank: 3, weight: 100 },
  warning: { bg: '#fef9c3', fg: '#854d0e', rank: 2, weight: 40 },
  info: { bg: '#dbeafe', fg: '#1e40af', rank: 1, weight: 5 }
};

// "Disponible" = tout sauf offline (un warning est un service dégradé, pas une panne)
export const isUp = (c) => c.status !== 'offline';

export const availabilityOf = (checks) => {
  if (!checks || checks.length === 0) return null;
  return (checks.filter(isUp).length / checks.length) * 100;
};

export const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

const warningText = (w) => (typeof w === 'string' ? w : w?.message || w?.msg || JSON.stringify(w));

export const alertsFor = (latest, availability, slaTarget, now) => {
  const out = [];
  if (!latest) return out;

  const days = certDays(latest);
  if (latest.status === 'offline') {
    out.push({ severity: 'critical', label: 'Offline', detail: latest.error || '' });
  }
  if (latest.certificate?.expired || (days !== null && days < 0)) {
    out.push({ severity: 'critical', label: 'Certificate expired' });
  } else if (days !== null && days <= CERT_CRIT_DAYS) {
    out.push({ severity: 'critical', label: `Certificate expires in ${days}d` });
  } else if (days !== null && days <= CERT_WARN_DAYS) {
    out.push({ severity: 'warning', label: `Certificate expires in ${days}d` });
  }
  if (latest.tls_trusted === false) {
    out.push({ severity: 'warning', label: 'Untrusted certificate', detail: latest.tls_verify_error || '' });
  }
  if (latest.status === 'warning') {
    const ws = Array.isArray(latest.warnings) ? latest.warnings.map(warningText) : [];
    out.push({
      severity: 'warning',
      label: ws.length > 0 ? `Warning: ${ws[0]}${ws.length > 1 ? ` (+${ws.length - 1})` : ''}` : 'Warning',
      detail: ws.join(' | ')
    });
  }
  if (['SSLv3', 'TLSv1', 'TLSv1.0', 'TLSv1.1'].includes(latest.tls_version)) {
    out.push({ severity: 'warning', label: `Legacy ${latest.tls_version}` });
  }
  if (typeof latest.total_ms === 'number' && latest.total_ms > SLOW_MS) {
    out.push({ severity: 'info', label: `Slow (${Math.round(latest.total_ms)} ms)` });
  }
  if (now - checkTs(latest) > STALE_HOURS * 3600 * 1000) {
    out.push({ severity: 'info', label: `No check for ${STALE_HOURS}h+` });
  }
  if (availability !== null && availability < slaTarget) {
    out.push({ severity: 'warning', label: `Availability ${availability.toFixed(2)}% < ${slaTarget}%` });
  }
  return out;
};

export const alertScore = (alerts) => alerts.reduce((sum, a) => sum + SEVERITY_META[a.severity].weight, 0);

/* ------------------------------------------------------------------ */
/*  Cibles = URL distinctes de l'historique                            */
/* ------------------------------------------------------------------ */
const targetKey = (c) => c.url || c.hostname || `server-${c.server_id}`;

export const buildTargets = (checks) => {
  const map = new Map();
  checks.forEach((c) => {
    const key = targetKey(c);
    if (!map.has(key)) {
      map.set(key, { key, url: c.url || key, hostname: c.hostname || '', serverId: c.server_id ?? null, checks: [] });
    }
    map.get(key).checks.push(c);
  });
  return Array.from(map.values()).map((t) => {
    t.checks.sort((a, b) => checkTs(b) - checkTs(a));
    return { ...t, latest: t.checks[0] };
  });
};

/* ------------------------------------------------------------------ */
/*  Fenêtre temporelle + buckets pour les graphes                      */
/* ------------------------------------------------------------------ */
export const windowBounds = (checks, hours, now) => {
  if (hours > 0) return { from: now - hours * 3600 * 1000, to: now };
  const times = checks.map(checkTs).filter(Boolean);
  const first = times.length > 0 ? Math.min(...times) : now - 3600 * 1000;
  return { from: Math.min(first, now - 60 * 1000), to: now };
};

export const inWindow = (checks, from, to) =>
  checks.filter((c) => {
    const t = checkTs(c);
    return t >= from && t <= to;
  });

export const makeBuckets = (checks, from, to, n = 48) => {
  const size = Math.max(1, to - from) / n;
  const buckets = Array.from({ length: n }, (_, i) => ({ t: from + size * (i + 0.5), checks: [] }));
  checks.forEach((c) => {
    const ts = checkTs(c);
    if (ts < from || ts > to) return;
    buckets[Math.min(n - 1, Math.floor((ts - from) / size))].checks.push(c);
  });
  return buckets;
};

export const bucketAvailability = (buckets) =>
  buckets.map((b) => [b.t, b.checks.length > 0 ? availabilityOf(b.checks) : null]);

export const bucketAvg = (buckets, field) =>
  buckets.map((b) => {
    const vals = b.checks.map((c) => c[field]).filter((v) => typeof v === 'number');
    return [b.t, vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null];
  });

/* ------------------------------------------------------------------ */
/*  Composants                                                         */
/* ------------------------------------------------------------------ */
export const Badge = ({ bg, fg, children, title }) => (
  <span
    title={title}
    style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: bg,
      color: fg,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </span>
);

export const StatusPill = ({ status }) => {
  const m = statusMeta(status);
  return <Badge bg={m.bg} fg={m.fg}>{m.label}</Badge>;
};

export const AlertBadge = ({ alert }) => {
  const m = SEVERITY_META[alert.severity];
  return <Badge bg={m.bg} fg={m.fg} title={alert.detail}>{alert.label}</Badge>;
};

export const KpiCard = ({ title, value, sub, icon: Icon, color }) => (
  <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{title}</p>
        <h2 className="font-mono" style={{ fontSize: '2.25rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            marginTop: '0.5rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {sub}
        </p>
      </div>
      <div
        style={{
          width: '48px',
          height: '48px',
          flexShrink: 0,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <Icon size={24} style={{ color }} />
      </div>
    </div>
  </div>
);

// Bande de pastilles : un carré par check (du plus ancien au plus récent)
export const StatusStrip = ({ checks, max = 60 }) => {
  const items = checks.slice(0, max).reverse();
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {items.map((c, i) => (
        <span
          key={`${c.id}-${i}`}
          title={`${statusMeta(c.status).label} · ${fmtDate(c.checked_at)}`}
          style={{ width: 8, height: 24, borderRadius: 2, background: statusMeta(c.status).color }}
        />
      ))}
    </div>
  );
};

export const ConfirmModal = ({ title, children, confirmLabel, busy, onConfirm, onCancel }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.5)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 460, background: 'var(--bg-primary)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
          <AlertTriangle size={22} style={{ color: 'var(--error-500)' }} />
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h2>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onConfirm}
            style={{ background: 'var(--error-500)', color: '#fff' }}
          >
            <Trash2 size={14} />
            {busy ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Graphe SVG par buckets (sans dépendance)                           */
/* ------------------------------------------------------------------ */
const niceMax = (v) => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

const formatTick = (ms, spanMs) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return spanMs > 24 * 3600 * 1000 ? `${d.getDate()}/${d.getMonth() + 1} ${time}` : time;
};

// series : [{ name, color, points: [[t, valeur | null], ...] }] (mêmes t pour toutes les séries)
export const BucketChart = ({ series, from, to, fixedMax = null, unit = '', decimals = 0 }) => {
  const [hover, setHover] = useState(null);

  const W = 900;
  const H = 240;
  const PL = 56;
  const PR = 16;
  const PT = 12;
  const PB = 28;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const span = Math.max(1, to - from);

  const values = series.flatMap((s) => s.points.map((p) => p[1]).filter((v) => v !== null && v !== undefined));
  if (values.length === 0) {
    return (
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
        No data for this period yet.
      </p>
    );
  }

  const yMax = fixedMax ?? niceMax(Math.max(...values));
  const x = (t) => PL + ((t - from) / span) * plotW;
  const y = (v) => PT + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => r * yMax);
  const xTicks = [0, 1, 2, 3, 4, 5].map((i) => from + (i / 5) * span);
  const fmt = (v) => `${Number(v).toFixed(decimals)}${unit}`;

  const pathFor = (points) => {
    let d = '';
    let open = false;
    points.forEach(([t, v]) => {
      if (v === null || v === undefined) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)} `;
      open = true;
    });
    return d;
  };

  const onMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    if (xv < PL || xv > W - PR) {
      setHover(null);
      return;
    }
    const t = from + ((xv - PL) / plotW) * span;
    const ref = series[0].points;
    let best = 0;
    ref.forEach((p, i) => {
      if (Math.abs(p[0] - t) < Math.abs(ref[best][0] - t)) best = i;
    });
    const rows = series
      .map((s) => ({ name: s.name, color: s.color, value: s.points[best] ? s.points[best][1] : null }))
      .filter((r) => r.value !== null && r.value !== undefined);
    setHover({ xv, t: ref[best][0], rows });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--border-light)" strokeWidth="1" />
              <text x={PL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">
                {fmt(v)}
              </text>
            </g>
          ))}

          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">
              {formatTick(t, span)}
            </text>
          ))}

          {series.map((s) => (
            <g key={s.name}>
              <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth="1.75" strokeLinejoin="round" />
              {s.points.map(([t, v]) =>
                v === null || v === undefined ? null : <circle key={t} cx={x(t)} cy={y(v)} r="2.5" fill={s.color} />
              )}
            </g>
          ))}

          {hover && <line x1={hover.xv} x2={hover.xv} y1={PT} y2={PT + plotH} stroke="var(--text-tertiary)" strokeDasharray="4 3" />}
        </svg>

        {hover && hover.rows.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: `${(hover.xv / W) * 100}%`,
              transform: hover.xv > W * 0.7 ? 'translateX(-105%)' : 'translateX(8px)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '0.5rem',
              boxShadow: 'var(--shadow-sm)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            <div style={{ color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>{new Date(hover.t).toLocaleString()}</div>
            {hover.rows.map((r) => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: r.color }} />
                <span>{r.name}</span>
                <strong className="font-mono" style={{ marginLeft: 'auto' }}>{fmt(r.value)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {series.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};