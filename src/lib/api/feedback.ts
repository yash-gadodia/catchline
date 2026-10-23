import { supabase } from '../supabase';
import { toApiError } from './errors';

export type ProblemReport = {
  id: string;
  body: string;
  appVersion: string;
  updateId: string;
  device: string;
  liftId: string | null;
  context: string | null;
  reportedAt: string;
};

// The id is picked on the phone: a resend the server already has hits the primary key, which counts as sent.
export async function sendProblemReport(r: ProblemReport): Promise<void> {
  const { error } = await supabase.from('problem_reports').insert({
    id: r.id,
    body: r.body,
    app_version: r.appVersion,
    update_id: r.updateId,
    device: r.device,
    lift_id: r.liftId,
    context: r.context,
    reported_at: r.reportedAt,
  });
  if (error && error.code !== '23505') throw toApiError(error);
}
