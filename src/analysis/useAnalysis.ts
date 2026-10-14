import { useEffect, useState } from 'react';
import { getAnalysis as fetchAnalysis } from '../lib/api';
import { getAnalysis } from './fixtures';
import { putLiveAnalysis } from './live';
import type { Analysis } from './types';

export type AnalysisLoad =
  | { status: 'ready'; analysis: Analysis }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' };

// The analysis behind a result route's `fixture` param. Bundled fixtures and
// analyses seen this session resolve at once; any other id is a lift id (the
// worker writes Analysis.id = lift id) and is fetched from the server, so a
// past lift opens after an app restart or from a deep link.
export function useAnalysis(key?: string | string[]): AnalysisLoad {
  const id = Array.isArray(key) ? key[0] : key;
  const known = getAnalysis(id);
  const [fetched, setFetched] = useState<{ id: string; analysis: Analysis | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (known || !id) return;
    let cancelled = false;
    fetchAnalysis(id)
      .then((analysis) => {
        if (cancelled) return;
        if (analysis) putLiveAnalysis(analysis);
        setFetched({ id, analysis, failed: false });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id, analysis: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [id, known]);

  if (known) return { status: 'ready', analysis: known };
  if (!id) return { status: 'missing' };
  if (!fetched || fetched.id !== id) return { status: 'loading' };
  if (fetched.analysis) return { status: 'ready', analysis: fetched.analysis };
  return { status: fetched.failed ? 'error' : 'missing' };
}
