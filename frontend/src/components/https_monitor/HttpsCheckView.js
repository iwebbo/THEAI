import React from 'react';
import { StatusPill, Badge, certDays, certColor, fmtDate, fmtMs } from './httpsShared';

/* ------------------------------------------------------------------ */
/*  Rendu d'un résultat de check (formulaire + détail)                 */
/*  Les champs inconnus sont affichés de façon générique (raw JSON).   */
/* ------------------------------------------------------------------ */
const render = (v) => {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(render).join(', ') || '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const protocolList = (p) => {
  if (!p) return [];
  if (Array.isArray(p)) return p.map((x) => (typeof x === 'string' ? x : x?.name || x?.protocol || JSON.stringify(x)));
  if (typeof p === 'object') return Object.entries(p).filter(([, ok]) => ok).map(([k]) => k);
  return [String(p)];
};

const warningText = (w) => (typeof w === 'string' ? w : w?.message || w?.msg || JSON.stringify(w));

const KV = ({ items }) => (
  <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.375rem 1rem', margin: 0, fontSize: '0.8125rem' }}>
    {items.map(([k, v]) => (
      <React.Fragment key={k}>
        <dt style={{ color: 'var(--text-tertiary)' }}>{k}</dt>
        <dd className="font-mono" style={{ margin: 0, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {render(v)}
        </dd>
      </React.Fragment>
    ))}
  </dl>
);

const Tile = ({ label, value, color }) => (
  <div style={{ padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
    <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
      {label}
    </p>
    <p className="font-mono" style={{ fontSize: '1.125rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</p>
  </div>
);

const SectionCard = ({ title, children }) => (
  <div className="card">
    <h2 className="card-header" style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{title}</h2>
    {children}
  </div>
);

const HttpsCheckView = ({ check }) => {
  if (!check) return null;

  const days = certDays(check);
  const cert = check.certificate && typeof check.certificate === 'object' ? check.certificate : null;
  const warnings = Array.isArray(check.warnings) ? check.warnings.map(warningText) : [];
  const protocols = protocolList(check.tls_protocols);
  const chain = Array.isArray(check.chain) ? check.chain : [];
  const san = Array.isArray(cert?.san) ? cert.san : [];

  const timings = Object.entries(check).filter(([k, v]) => k.endsWith('_ms') && typeof v === 'number');
  const timingMax = Math.max(1, ...timings.map(([, v]) => v));

  const trusted = check.tls_trusted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Bandeau */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <StatusPill status={check.status} />
          <span className="font-mono" style={{ fontSize: '0.875rem', wordBreak: 'break-all' }}>{check.url}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            {fmtDate(check.checked_at)}
          </span>
        </div>

        {check.error && (
          <p style={{ color: 'var(--error-500)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>{String(check.error)}</p>
        )}
        {check.tls_verify_error && (
          <p style={{ color: '#9a3412', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>TLS: {String(check.tls_verify_error)}</p>
        )}
        {warnings.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
            {warnings.map((w) => (
              <Badge key={w} bg="#fef9c3" fg="#854d0e">{w}</Badge>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          <Tile label="HTTP status" value={check.http_status_code ?? '-'} />
          <Tile label="TTFB" value={fmtMs(check.ttfb_ms)} />
          <Tile label="Total" value={fmtMs(check.total_ms)} />
          <Tile label="TLS" value={check.tls_version || '-'} />
          <Tile label="Certificate" value={days !== null ? `${days}d` : '-'} color={certColor(days)} />
          <Tile
            label="Trusted"
            value={trusted === null || trusted === undefined ? '-' : trusted ? 'Yes' : 'No'}
            color={trusted === false ? 'var(--error-500)' : undefined}
          />
        </div>
      </div>

      {/* Détail des temps */}
      {timings.length > 0 && (
        <SectionCard title="Timings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {timings.map(([k, v]) => (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ textTransform: 'capitalize' }}>{k.replace(/_ms$/, '').replace(/_/g, ' ')}</span>
                  <span className="font-mono">{fmtMs(v)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${(v / timingMax) * 100}%`, height: '100%', backgroundColor: '#3b82f6' }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* TLS + certificat */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <SectionCard title="TLS">
          <KV
            items={[
              ['Version', check.tls_version],
              ['Cipher suite', check.cipher_suite],
              ['ALPN', check.alpn_protocol],
              ['Trusted', trusted],
              ['Verify error', check.tls_verify_error]
            ]}
          />
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.375rem' }}>Supported protocols</p>
            {protocols.length === 0 ? (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>-</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {protocols.map((p) => (
                  <Badge key={p} bg="#e5e7eb" fg="#374151">{p}</Badge>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Certificate">
          {cert ? (
            <>
              <KV
                items={[
                  ['Subject CN', cert.subject_cn],
                  ['Issuer CN', cert.issuer_cn],
                  ['Valid until', cert.not_after ? fmtDate(cert.not_after) : null],
                  ['Days remaining', days],
                  ['Expired', cert.expired],
                  ['Public key', cert.public_key],
                  ['Signature', cert.signature_algorithm],
                  ['SHA-256', cert.fingerprint_sha256]
                ]}
              />
              {san.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.375rem' }}>
                    Subject alternative names ({san.length})
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {san.slice(0, 20).map((s) => (
                      <Badge key={String(s)} bg="#e5e7eb" fg="#374151">{String(s)}</Badge>
                    ))}
                    {san.length > 20 && <Badge bg="#e5e7eb" fg="#374151">+{san.length - 20} more</Badge>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No certificate (plain HTTP or TLS handshake failed).</p>
          )}
        </SectionCard>
      </div>

      {/* Chaîne de certification */}
      {chain.length > 0 && (
        <SectionCard title={`Certificate chain (${chain.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {chain.map((item, i) => {
              const entries =
                item && typeof item === 'object'
                  ? Object.entries(item).filter(([, v]) => v === null || typeof v !== 'object' || Array.isArray(v))
                  : [['value', item]];
              return (
                <div key={i} style={{ padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>#{i + 1}</p>
                  <KV items={entries} />
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Raw response</summary>
        <pre
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            maxHeight: 320,
            overflow: 'auto',
            fontSize: '0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          {JSON.stringify(check, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export default HttpsCheckView;