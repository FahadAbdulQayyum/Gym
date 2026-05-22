import { useCallback, useEffect, useMemo, useState } from 'react';
import './ModulePage.css';
import './SetupZK50.css';

export default function SetupZK50() {
  const [mode, setMode] = useState('manual');
  const [ip, setIp] = useState('192.168.10.21');
  const [port, setPort] = useState('4370');
  const [connected, setConnected] = useState(false);
  const [realtimeOn, setRealtimeOn] = useState(false);
  const [scans, setScans] = useState([]);
  const [scanFilter, setScanFilter] = useState('all');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');

  const api = window.gymApp?.zk50;

  const load = useCallback(async () => {
    if (!api?.getConfig) return;
    const cfg = await api.getConfig();
    setMode(cfg.mode ?? 'manual');
    setIp(cfg.ip ?? '192.168.10.21');
    setPort(String(cfg.port ?? 4370));
    setConnected(!!cfg.connected);
    setRealtimeOn(!!cfg.realtimeOn);
    if (api.listScans) {
      setScans(await api.listScans());
    }
  }, [api]);

  useEffect(() => {
    load();
    if (!api?.getConfig) return undefined;

    const interval = setInterval(async () => {
      if (!connected || !api.listScans) return;
      setScans(await api.listScans());
    }, 3000);

    return () => clearInterval(interval);
  }, [api, connected, load]);

  const visibleScans = useMemo(() => {
    if (scanFilter === 'allowed') return scans.filter((s) => s.allowed);
    if (scanFilter === 'denied') return scans.filter((s) => !s.allowed);
    return scans;
  }, [scans, scanFilter]);

  async function persistConfig(next) {
    if (!api?.saveConfig) return;
    await api.saveConfig({
      mode,
      ip,
      port: Number(port) || 4370,
      connected: next.connected ?? connected,
      realtimeOn: next.realtimeOn ?? realtimeOn,
    });
  }

  async function handleConnect() {
    if (!api?.connect) {
      setMessage('ZK50 is only available in the desktop app.');
      return;
    }
    setConnecting(true);
    setMessage('');
    try {
      const cfg = await api.connect({ mode, ip, port: Number(port) || 4370 });
      setConnected(!!cfg.connected);
      setRealtimeOn(!!cfg.realtimeOn);
      setMessage('Connected to ZK50 device (local bridge). Live attendance is on.');
      await load();
    } catch (err) {
      setMessage(err.message ?? 'Connection failed');
      setConnected(false);
      setRealtimeOn(false);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!api?.disconnect) return;
    const cfg = await api.disconnect();
    setConnected(!!cfg.connected);
    setRealtimeOn(!!cfg.realtimeOn);
    setMessage('Disconnected.');
  }

  return (
    <div className="module-page zk50-page">
      <section className="module-card card zk50-page__setup">
        <h2 className="module-card__title">ZK50 Machine Setup</h2>

        <div className="zk50-page__mode">
          <label>
            <input
              type="radio"
              name="zk50-mode"
              checked={mode === 'auto'}
              onChange={() => setMode('auto')}
            />
            Auto
          </label>
          <label>
            <input
              type="radio"
              name="zk50-mode"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            Manual
          </label>
        </div>

        <div className="zk50-page__fields">
          <label>
            Device IP
            <input
              className="module-input"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onBlur={() => persistConfig({})}
              disabled={connected}
            />
          </label>
          <label>
            Port
            <input
              className="module-input"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onBlur={() => persistConfig({})}
              disabled={connected}
            />
          </label>
        </div>

        <div className="zk50-page__status-row">
          <span className={`zk50-page__badge${connected ? ' is-on' : ''}`}>
            {connected ? 'Connected' : 'Not Connected'}
          </span>
          <span className={`zk50-page__badge${realtimeOn ? ' is-on' : ''}`}>
            {realtimeOn ? 'Realtime ON' : 'Realtime OFF'}
          </span>
          <div className="zk50-page__actions">
            {!connected ? (
              <button type="button" className="module-btn-gold" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            ) : (
              <button type="button" className="module-btn-outline" onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
          </div>
        </div>

        {message && <p className="zk50-page__msg">{message}</p>}
      </section>

      <section className="module-card card zk50-page__live">
        <header className="zk50-page__live-header">
          <h2 className="module-card__title">Live Attendance</h2>
          <div className="zk50-page__filters">
            <button
              type="button"
              className={`zk50-page__pill zk50-page__pill--allowed${scanFilter === 'allowed' ? ' is-active' : ''}`}
              onClick={() => setScanFilter(scanFilter === 'allowed' ? 'all' : 'allowed')}
            >
              Allowed
            </button>
            <button
              type="button"
              className={`zk50-page__pill zk50-page__pill--denied${scanFilter === 'denied' ? ' is-active' : ''}`}
              onClick={() => setScanFilter(scanFilter === 'denied' ? 'all' : 'denied')}
            >
              Denied
            </button>
          </div>
        </header>

        <ul className="zk50-page__scans">
          {visibleScans.length === 0 && <li className="zk50-page__empty">No scans yet.</li>}
          {visibleScans.map((scan) => (
            <li key={scan.id} className={scan.allowed ? 'is-allowed' : 'is-denied'}>
              <span className="zk50-page__scan-time">
                {new Date(scan.scannedAt).toLocaleTimeString()}
              </span>
              <strong>{scan.name}</strong>
              {scan.memberCode && <span>#{scan.memberCode}</span>}
              <span className="zk50-page__scan-status">{scan.allowed ? 'Allowed' : 'Denied'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
