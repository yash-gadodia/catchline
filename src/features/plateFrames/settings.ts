import { useState } from 'react';
import { deleteMyPlateFrames } from '../../lib/api';
import { plateFramesSupported, setPlateFramesChoice, usePlateFramesConsent, PLATE_FRAMES_CONSENT_VERSION } from './consent';
import { clearPlateFrameOutbox } from './outbox';

export type DeleteNote = 'deleted' | 'failed' | null;

// The You tab's two rows: the switch (off stops every future send and empties what was waiting) and "Delete the
// frames I sent" (the server erases the crops and their records; what was waiting on the phone goes too).
export function usePlateFramesSettings(): {
  supported: boolean;
  on: boolean;
  canDelete: boolean;
  note: DeleteNote;
  busy: boolean;
  toggle: (on: boolean) => void;
  deleteSent: () => Promise<void>;
} {
  const choice = usePlateFramesConsent((s) => s.choice);
  const [note, setNote] = useState<DeleteNote>(null);
  const [busy, setBusy] = useState(false);
  return {
    supported: plateFramesSupported(),
    on: choice?.granted === true && choice.version === PLATE_FRAMES_CONSENT_VERSION,
    canDelete: choice !== null,
    note,
    busy,
    toggle: (on) => {
      setNote(null);
      if (!on) clearPlateFrameOutbox();
      void setPlateFramesChoice(on);
    },
    deleteSent: async () => {
      if (busy) return;
      setBusy(true);
      clearPlateFrameOutbox();
      try {
        await deleteMyPlateFrames();
        setNote('deleted');
      } catch {
        setNote('failed');
      } finally {
        setBusy(false);
      }
    },
  };
}
