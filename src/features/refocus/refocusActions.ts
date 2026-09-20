import type { ChatLine } from '../../domain/chatPaste';
import { supabase } from '../../lib/supabase';
import { notifyRefocus } from '../notifications';
import type {
  RefocusAiResult,
  RefocusMediation,
  RefocusReadV2,
  RefocusSafety,
} from '../../content/refocus';

// ── ONE SIDE (v2) ──────────────────────────────────────────────────────────

export type SoloV2Outcome =
  | { read: RefocusReadV2 }
  | { safety: RefocusSafety };

function isReadV2(v: unknown): v is RefocusReadV2 {
  const r = v as RefocusReadV2 | null;
  if (!r || r.schema !== 'v2') return false;
  if (typeof r.underneath !== 'string' || typeof r.not_wrong_about !== 'string') {
    return false;
  }
  if (r.bridge_decision === 'bridge') {
    return typeof r.bridge === 'string' && r.bridge.trim().length > 0;
  }
  return (
    r.bridge_decision === 'no_bridge' &&
    !!r.no_bridge &&
    typeof r.no_bridge.noticed === 'string' &&
    typeof r.no_bridge.let_go === 'string'
  );
}

/**
 * A chat screenshot in, the visible messages out as chat lines, exactly the
 * shape a paste produces. Nothing is stored server-side. Null = failure.
 */
export async function transcribeScreenshot(
  base64: string,
  mediaType: string
): Promise<ChatLine[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      lines?: unknown;
    }>('refocus', {
      body: { schema: 'transcribe', imageBase64: base64, mediaType },
    });
    if (error || !data || !Array.isArray(data.lines)) return null;
    return data.lines.filter(
      (l): l is ChatLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as ChatLine).who === 'string' &&
        typeof (l as ChatLine).text === 'string'
    );
  } catch {
    return null;
  }
}

/**
 * The One Side read: one account (plus an optional pasted chat excerpt) in,
 * the v2 triad or a first-class no-bridge out. Null = failure; the screen
 * shows the honest retry state and the words are already safe in the draft
 * store. NOTE: nothing in this path ever calls mark_bridge_sent — "sent" is a
 * manual act recorded in Receipts (PRD §7).
 */
export async function analyzeV2(
  userText: string,
  pastedChat?: string
): Promise<SoloV2Outcome | null> {
  try {
    const { data, error } = await supabase.functions.invoke<
      RefocusReadV2 & { safety?: RefocusSafety }
    >('refocus', {
      body: {
        schema: 'v2',
        userText,
        ...(pastedChat?.trim() ? { pastedChat } : {}),
      },
    });
    if (error || !data) return null;
    if (
      data.safety &&
      (data.safety.type === 'crisis' || data.safety.type === 'abuse') &&
      typeof data.safety.title === 'string' &&
      Array.isArray(data.safety.helplines)
    ) {
      return { safety: data.safety };
    }
    if (isReadV2(data)) return { read: data };
    return null;
  } catch {
    return null;
  }
}

// Raised by start_refocus (0020) when the couple already has an open
// (waiting_partner / ready) session.
export const REFOCUS_ALREADY_OPEN = 'refocus_session_already_open';

/**
 * Open a two-sided refocus session: the initiator's topic + their real side.
 * All guards (membership, one open session per couple) live in the DEFINER
 * RPC. On success, fires the "add your side" push to the partner
 * (fire-and-forget) — start_refocus itself already logged the 'refocus'
 * activity server-side.
 */
export async function startRefocus(
  coupleId: string,
  topic: string,
  side: string
): Promise<string> {
  // @ts-expect-error supabase-js typed rpc args resolve to never for this fn
  const { data, error } = await supabase.rpc('start_refocus', {
    p_couple: coupleId,
    p_topic: topic,
    p_side: side,
  });
  if (error) throw error;

  // fire-and-forget; no-op without a session. The session id lets the edge fn
  // add the topic to the async "for whenever you're ready" copy (V2 F1).
  notifyRefocus(coupleId, data as string);

  return data as string;
}

/**
 * The NON-initiator member adds their real side; the DEFINER RPC flips the
 * session waiting_partner -> ready. Mediation is a separate edge-fn call.
 */
export async function addRefocusSide(
  sessionId: string,
  side: string
): Promise<void> {
  // @ts-expect-error supabase-js typed rpc args resolve to never for this fn
  const { error } = await supabase.rpc('add_refocus_side', {
    p_session: sessionId,
    p_side: side,
  });
  if (error) throw error;
}

/**
 * A revisitable title for a solo session, derived from the user's words:
 * first line, whitespace collapsed, capped at 64 chars. Only the author ever
 * sees it (solo rows are author-only under RLS).
 */
export function soloTopic(sideText: string): string {
  const line = sideText.trim().split('\n')[0].replace(/\s+/g, ' ').trim();
  if (line.length <= 64) return line || 'a moment to untangle';
  return `${line.slice(0, 63).trimEnd()}…`;
}

/**
 * Persist a completed solo reflection (V2 F1, migration 0043): one atomic
 * DEFINER call creates the session already-revealed with the ai_result, so a
 * solo row can never occupy the couple's open-session slot. Returns the
 * session id, or null on failure — the caller keeps the on-screen result
 * either way and stays honest about what saved.
 */
export async function persistSoloRefocus(
  coupleId: string,
  sideText: string,
  aiResult: unknown
): Promise<string | null> {
  try {
    // @ts-expect-error supabase-js typed rpc args resolve to never for this fn
    const { data, error } = await supabase.rpc('save_solo_refocus', {
      p_couple: coupleId,
      p_topic: soloTopic(sideText),
      p_side: sideText.trim(),
      p_ai_result: aiResult,
    });
    if (error) return null;
    return (data as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * LEGACY (couples flow only) — arms the 24h repair check-in that BOTH
 * partners see. The One Side path must never call this: Copy records only
 * 'copied' in the local Receipts store, and "sent" is the user's own manual
 * mark there. (Stamping sent-on-copy both falsified the §7 test metric and
 * pinged the partner from a one-person app.)
 */
export async function markBridgeSent(sessionId: string): Promise<void> {
  try {
    // @ts-expect-error supabase-js typed rpc args resolve to never for this fn
    await supabase.rpc('mark_bridge_sent', { p_session: sessionId });
  } catch {
    // no-op
  }
}

function isMediation(v: unknown): v is RefocusMediation {
  const m = v as RefocusMediation | null;
  return (
    !!m &&
    m.type === 'mediation' &&
    typeof m.shared_ground === 'string' &&
    typeof m.initiator_underneath === 'string' &&
    typeof m.partner_underneath === 'string' &&
    typeof m.initiator_bridge === 'string' &&
    typeof m.partner_bridge === 'string'
  );
}

function isSafety(v: unknown): v is RefocusSafety {
  const s = v as RefocusSafety | null;
  return (
    !!s &&
    (s.type === 'crisis' || s.type === 'abuse') &&
    typeof s.title === 'string' &&
    typeof s.message === 'string' &&
    Array.isArray(s.helplines)
  );
}

/** Narrow an unknown payload (edge-fn response OR a stored ai_result read off
 * the session row / realtime) to a renderable result. Null = not renderable. */
export function parseAiResult(data: unknown): RefocusAiResult | null {
  if (isMediation(data)) return data;
  if (isSafety(data)) return data;
  return null;
}

/**
 * Ask the refocus edge function to mediate a 'ready' session (or return the
 * stored result of an already-revealed one — the server is idempotent, so
 * whichever partner calls first pays for the tokens and both converge on the
 * SAME stored result). Null = failure; the screen shows its honest error state.
 */
export async function mediateSession(
  sessionId: string
): Promise<RefocusAiResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke<unknown>('refocus', {
      body: { sessionId },
    });
    if (error) return null;
    return parseAiResult(data);
  } catch {
    return null;
  }
}
