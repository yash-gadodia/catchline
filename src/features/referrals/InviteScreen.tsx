import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, shape, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { formatDate, t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';
import { signInWithApple, type AppleSignIn } from '../auth/appleSignIn';
import { useAuthUser } from '../auth/authUser';
import { usePurchases } from '../purchases/usePurchases';
import * as defaultApi from './api';
import { inviteLink, monthsOf, normalizeCode, type ClaimError, type MyReferral } from './api';
import { useInvite } from './store';

export type InviteApi = Pick<typeof defaultApi, 'fetchMyReferral' | 'claimCode' | 'collectRewards'>;

export function inviteMessage(kind: 'friend' | 'gym', code: string): string {
  return t(kind === 'friend' ? 'invite.message.friend' : 'invite.message.gym', { code, link: inviteLink(code) });
}

export default function InviteScreen({
  onBack,
  api = defaultApi,
  signIn = signInWithApple,
  share = (message: string) => Share.share({ message }).then(() => undefined),
}: {
  onBack: () => void;
  api?: InviteApi;
  signIn?: () => Promise<AppleSignIn>;
  share?: (message: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const anonymous = useAuthUser((s) => s.anonymous);
  const pendingCode = useInvite((s) => s.pendingCode);
  const [mine, setMine] = useState<MyReferral | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [code, setCode] = useState(pendingCode ?? '');
  const [claimNote, setClaimNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadFailed(false);
      setMine(await api.fetchMyReferral());
    } catch {
      setLoadFailed(true);
    }
  }, [api]);

  useEffect(() => {
    track(EVENTS.INVITE_OPENED, { signed_in: !anonymous });
  }, [anonymous]);

  useEffect(() => {
    if (anonymous) return;
    void load();
    void api.collectRewards().then(() => usePurchases.getState().refresh()).catch(() => undefined);
  }, [anonymous, api, load]);

  useEffect(() => {
    if (pendingCode) setCode(pendingCode);
  }, [pendingCode]);

  const doSignIn = async () => {
    try {
      await signIn();
    } catch {
      setClaimNote(t('invite.err.sign_in_required'));
    }
  };

  const doShare = async (kind: 'friend' | 'gym') => {
    if (!mine) return;
    track(EVENTS.INVITE_SHARED, { kind, code_kind: mine.kind });
    await share(inviteMessage(kind, mine.code)).catch(() => undefined);
  };

  const doClaim = async () => {
    const c = normalizeCode(code);
    if (!c || busy) return;
    setBusy(true);
    try {
      const res = await api.claimCode(c);
      track(EVENTS.REFERRAL_CLAIMED, { ok: res.ok, result: res.ok ? res.status : res.error });
      if (res.ok) {
        useInvite.getState().setPendingCode(null);
        setClaimNote(t(res.status === 'qualified' ? 'invite.claim.qualified' : 'invite.claim.claimed'));
        if (res.status === 'qualified') await api.collectRewards().then(() => usePurchases.getState().refresh()).catch(() => undefined);
      } else {
        setClaimNote(t(`invite.err.${res.error}` as `invite.err.${ClaimError}`));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="invite-screen">
      <TopBar back={t('you.title')} onBack={onBack} more={false} center={<Text style={{ color: colors.text, ...type.button }}>{t('invite.row')}</Text>} />
      <ScrollView contentContainerStyle={{ paddingTop: space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s7, gap: space.s5 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.s2 }}>
          <Text style={{ color: colors.text, ...type.title }}>{t('invite.title')}</Text>
          <Text style={{ color: colors.text2, ...type.body }}>{mine?.kind === 'coach' ? t('invite.coachBody') : t('invite.body')}</Text>
          {mine?.kind === 'coach' ? null : <Text style={{ color: colors.text2, ...type.callout }}>{t('invite.milestones')}</Text>}
        </View>

        {anonymous ? (
          <View style={{ gap: space.s3 }}>
            <Btn onPress={() => void doSignIn()} testID="invite-sign-in">{t('invite.signIn')}</Btn>
            <Text style={{ color: colors.text3, ...type.small }}>{t('invite.signInWhy')}</Text>
          </View>
        ) : mine ? (
          <View style={{ gap: space.s4 }}>
            <View style={{ gap: space.s1 }}>
              <SmallCaps>{t('invite.yourCode')}</SmallCaps>
              <Text selectable style={[display(48), { color: colors.text }]} testID="invite-code">{mine.code}</Text>
              <Text style={{ color: colors.text2, ...type.callout }} testID="invite-progress">
                {[
                  t('invite.progress', { count: mine.joined }),
                  t('invite.earned', { count: monthsOf(mine.daysEarned) }),
                  ...(mine.proUntil && new Date(mine.proUntil) > new Date() ? [t('invite.proUntil', { date: formatDate(new Date(mine.proUntil), { day: 'numeric', month: 'short', year: 'numeric' }) })] : []),
                ].join(' · ')}
              </Text>
              {mine.nextMilestone != null && mine.kind === 'friend' ? (
                <Text style={{ color: colors.text3, ...type.small }}>{t('invite.next', { count: mine.nextMilestone - mine.qualified })}</Text>
              ) : null}
              {mine.badge ? <SmallCaps color={colors.text} style={{ marginTop: space.s1 }}>{t('invite.badge')}</SmallCaps> : null}
            </View>
            <View style={{ gap: space.s3 }}>
              <Btn onPress={() => void doShare('friend')} testID="invite-share-friend">{t('invite.shareFriend')}</Btn>
              <Btn kind="secondary" onPress={() => void doShare('gym')} testID="invite-share-gym">{t('invite.shareGym')}</Btn>
            </View>
            {mine.friends.length > 0 ? (
              <View>
                <SmallCaps style={{ marginBottom: space.s2 }}>{t('invite.friends')}</SmallCaps>
                {mine.friends.map((f, i) => (
                  <View key={`${f.at}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s3, paddingVertical: space.s3, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                    <Text style={{ color: colors.text, ...type.body }}>{f.name ?? t('invite.friend.someone')}</Text>
                    <Text style={{ color: colors.text2, ...type.callout }}>{t(f.status === 'qualified' ? 'invite.friend.qualified' : 'invite.friend.claimed')}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : loadFailed ? (
          <View style={{ gap: space.s3 }}>
            <Text style={{ color: colors.text2, ...type.callout }} testID="invite-load-failed">{t('invite.err.generic')}</Text>
            <Btn kind="secondary" compact onPress={() => void load()}>{t('common.launch.retry')}</Btn>
          </View>
        ) : null}

        <View style={{ gap: space.s3, paddingTop: space.s3, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <Text style={{ color: colors.text, ...type.button }}>{t('invite.claim.title')}</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(normalizeCode(v))}
            placeholder={t('invite.claim.placeholder')}
            placeholderTextColor={colors.text3}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="invite-claim-input"
            style={{
              height: 52,
              borderWidth: 1,
              borderColor: colors.text,
              ...shape.control,
              paddingHorizontal: space.s3,
              color: colors.text,
              fontFamily: fontFamily.mono,
              // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
              fontSize: 17,
            }}
          />
          {anonymous ? (
            <Btn kind="secondary" compact onPress={() => void doSignIn()} testID="invite-claim-sign-in">{t('invite.claim.signIn')}</Btn>
          ) : (
            <Btn kind="secondary" compact disabled={!code || busy} onPress={() => void doClaim()} testID="invite-claim">{t('invite.claim.use')}</Btn>
          )}
          {claimNote ? <Text style={{ color: colors.text2, ...type.callout }} testID="invite-claim-note">{claimNote}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}
