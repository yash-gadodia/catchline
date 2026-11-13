import { useEffect, useState } from 'react';
import type { Body } from '../../analysis/device/tracking';
import { readLocalBody } from '../../data/localLifts';

// The joints saved with a lift (body.json). `ready` turns true once the read has settled for this lift; a lift
// without the file, or with one that cannot be read, has a null body.
export function useLocalBody(liftId: string | undefined, enabled: boolean): { ready: boolean; body: Body | null } {
  const [state, setState] = useState<{ id: string; body: Body | null } | null>(null);
  useEffect(() => {
    if (!liftId || !enabled) return;
    let live = true;
    readLocalBody(liftId).then(
      (b) => live && setState({ id: liftId, body: b }),
      () => live && setState({ id: liftId, body: null }),
    );
    return () => {
      live = false;
    };
  }, [liftId, enabled]);
  const ready = !!state && state.id === liftId;
  return { ready, body: ready ? state.body : null };
}
