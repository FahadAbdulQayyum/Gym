import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PACKAGES, normalizePackage } from './memberShared';

export function usePackages(options = {}) {
  const { includeInactive = false } = options;
  const [packages, setPackages] = useState(() =>
    (includeInactive ? DEFAULT_PACKAGES : DEFAULT_PACKAGES.filter((p) => p.active !== false)).map(
      normalizePackage
    )
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const api = window.gymApp?.packages;

  const loadPackages = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      const fallback = includeInactive
        ? DEFAULT_PACKAGES
        : DEFAULT_PACKAGES.filter((p) => p.active !== false);
      setPackages(fallback.map(normalizePackage));
      return;
    }

    try {
      setError('');
      const list = await api.list({ includeInactive });
      setPackages(list.map(normalizePackage));
    } catch (err) {
      setError(err.message ?? 'Failed to load packages');
      const fallback = includeInactive
        ? DEFAULT_PACKAGES
        : DEFAULT_PACKAGES.filter((p) => p.active !== false);
      setPackages(fallback.map(normalizePackage));
    } finally {
      setLoading(false);
    }
  }, [api, includeInactive]);

  useEffect(() => {
    setLoading(true);
    loadPackages();
  }, [loadPackages]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadPackages();
      }
    });
  }, [loadPackages]);

  return { packages, loading, error, reload: loadPackages };
}
