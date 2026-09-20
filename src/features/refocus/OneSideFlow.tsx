import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from '../../components/Toast';
import { colors } from '../../design/tokens';
import {
  CAPTURE_COPY,
  RefocusReadV2,
  RefocusSafety,
} from '../../content/refocus';
import { track, EVENTS } from '../../lib/analytics';
import { SoloV2Outcome } from './refocusActions';
import {
  addReceipt,
  markCopied,
  saveDraft,
  clearDraft,
} from './receipts';
import { CaptureStep } from './steps/CaptureStep';
import { WorkingStep } from './steps/WorkingStep';
import { ReadResultStep } from './steps/ReadResultStep';
import { success } from '../../lib/haptics';
import { ErrorStep } from './steps/ErrorStep';
import { SafetyStep } from './steps/SafetyStep';

type OneSideStep = 'capture' | 'working' | 'result' | 'error' | 'safety';

/**
 * ONE SIDE — the whole solo app in one flow. Capture is the launch surface;
 * the raw entry hits the draft store before any model call (Working/Retry
 * first, PRD §10); Copy records copied only; "sent" is a manual act in
 * Receipts; the single regenerate is spent once per read.
 */
export function OneSideFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<OneSideStep>('capture');
  const [text, setText] = useState('');
  const [pastedChat, setPastedChat] = useState<string | null>(null);
  const [read, setRead] = useState<RefocusReadV2 | null>(null);
  const [safety, setSafety] = useState<RefocusSafety | null>(null);
  const [regenerated, setRegenerated] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // CaptureStep owns its own input state; bumping the key is the reset. A
  // remount re-reads the draft store, so a cancelled read still restores the
  // words (the draft is only cleared on success or Just save).
  const [captureKey, setCaptureKey] = useState(0);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const reset = () => {
    setStep('capture');
    setCaptureKey((k) => k + 1);
    setText('');
    setPastedChat(null);
    setRead(null);
    setSafety(null);
    setRegenerated(false);
    setReceiptId(null);
  };

  const fullAccount = (t: string, chat: string | null) =>
    chat ? `${t.trim()}\n\n${chat}` : t.trim();

  const handleRead = async (t: string, chat: string | null) => {
    setText(t);
    setPastedChat(chat);
    // The Retry guarantee: words are safe BEFORE the call leaves the phone.
    await saveDraft(t);
    track(EVENTS.REFOCUS_STARTED, { mode: 'one_side' });
    setStep('working');
  };

  const handleJustSave = async (t: string, chat: string | null) => {
    await addReceipt(fullAccount(t, chat), 'saved');
    await clearDraft();
    showToast(CAPTURE_COPY.savedAnnounce);
    reset();
  };

  const handleDone = async (outcome: SoloV2Outcome) => {
    track(EVENTS.REFOCUS_COMPLETED);
    success();
    await clearDraft();
    if ('safety' in outcome) {
      const r = await addReceipt(fullAccount(text, pastedChat), 'read', 'safety');
      setReceiptId(r.id);
      setSafety(outcome.safety);
      setStep('safety');
      return;
    }
    const r = await addReceipt(
      fullAccount(text, pastedChat),
      'read',
      outcome.read.bridge_decision
    );
    setReceiptId(r.id);
    setRead(outcome.read);
    setStep('result');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {step === 'capture' && (
        <CaptureStep
          key={captureKey}
          insets={insets}
          onRead={handleRead}
          onOpenReceipts={() => router.push('/(sheets)/receipts')}
          onOpenSettings={() => router.push('/(sheets)/settings')}
        />
      )}

      {step === 'working' && (
        <WorkingStep
          userText={text}
          pastedChat={pastedChat}
          onDone={handleDone}
          onError={() => setStep('error')}
          onCancel={() => setStep('capture')}
          onSaveInstead={() => handleJustSave(text, pastedChat)}
        />
      )}

      {step === 'error' && (
        <ErrorStep
          text={text}
          onRetry={() => setStep('working')}
          onBack={() => setStep('capture')}
        />
      )}

      {step === 'result' && read && (
        <ReadResultStep
          insets={insets}
          read={read}
          regenerated={regenerated}
          onRegenerate={() => {
            // One shot only; the same account runs once more.
            setRegenerated(true);
            setStep('working');
          }}
          onCopied={() => {
            if (receiptId) markCopied(receiptId);
            showToast('Copied. Send it when it sounds like you.');
          }}
          onDone={() => {
            reset();
            setStep('capture');
          }}
        />
      )}

      {step === 'safety' && safety && (
        <SafetyStep
          safety={safety}
          onBack={() => {
            reset();
            setStep('capture');
          }}
        />
      )}

      {toastMsg && <Toast msg={toastMsg} />}
    </View>
  );
}
