import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ANALYSES } from '../../analysis/fixtures';
import { movementLabel } from '../../analysis/format';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import SmallCaps from '../../components/SmallCaps';
import { colors, radius, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { Chip, SheetTitle, Toggle } from '../share/ui';
import { accountLine, accountRepository, isFounding, planLabel, useAccount, type DataExport } from './account';
import {
  AUTO_DELETE_LABELS,
  DAY_NAMES,
  FRAME_RATE_LABELS,
  MOVEMENTS,
  REMINDER_TIMES,
  UNIT_LABELS,
  settingLabels,
  settingsOf,
  useSettings,
  type Settings,
} from './settings';

type Nav = { onWhatIsStored: () => void; onDeleteAccount: () => void; onPlan: () => void; onHelp: () => void };
type Picker = 'name' | 'units' | 'defaultMovement' | 'frameRate' | 'cueReminder' | 'autoDelete' | null;

function options<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

const PICKERS = {
  units: options(UNIT_LABELS),
  defaultMovement: MOVEMENTS.map((m) => ({ value: m, label: movementLabel(m) })),
  frameRate: options(FRAME_RATE_LABELS),
  autoDelete: options(AUTO_DELETE_LABELS),
};

export async function shareExport(bundle: DataExport): Promise<void> {
  await Share.share({ title: 'catchline-export.json', message: JSON.stringify(bundle, null, 2) });
}

// SIM: the lift ids come from the bundled fixtures until Memory has real lifts.
export async function exportMyData(send: (bundle: DataExport) => Promise<void> = shareExport): Promise<void> {
  await send(await accountRepository.exportAllData(settingsOf(useSettings.getState()), Object.keys(ANALYSES)));
}

export default function YouScreen({
  nav,
  version = Constants.expoConfig?.version ?? '1.0.0',
  exportData = shareExport,
}: {
  nav: Nav;
  version?: string;
  exportData?: (bundle: DataExport) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const settings = useSettings();
  const labels = settingLabels(settings);
  const [picker, setPicker] = useState<Picker>(null);

  const close = () => setPicker(null);
  const doExport = () => exportMyData(exportData);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="you-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.s7, paddingHorizontal: space.gutter, paddingBottom: 120 }}>
        <Text style={[display(36), { color: colors.text, marginBottom: space.s2 }]}>You</Text>
        {account ? (
          <Row
            title={account.name}
            bold
            sub={accountLine(account)}
            right={<Value>Edit</Value>}
            onPress={() => setPicker('name')}
            testID="row-profile"
          />
        ) : null}
        {account ? (
          <Row
            title="Plan"
            sub={planLabel(account.plan)}
            right={isFounding(account.plan) ? <FoundingBadge /> : <Value>›</Value>}
            onPress={nav.onPlan}
            testID="row-plan"
          />
        ) : null}
        <Section>Lifting</Section>
        <Row title="Units" right={<Value>{labels.units}</Value>} onPress={() => setPicker('units')} testID="row-units" />
        <Row title="Default lift" right={<Value>{labels.defaultMovement}</Value>} onPress={() => setPicker('defaultMovement')} testID="row-movement" />
        <Row title="Frame rate" right={<Value>{labels.frameRate}</Value>} onPress={() => setPicker('frameRate')} testID="row-frame-rate" />
        <Row
          title="Voice countdown"
          right={<Toggle value={settings.voiceCountdown} onChange={(v) => settings.set('voiceCountdown', v)} testID="toggle-voice" />}
        />
        <Row title="Haptics" right={<Toggle value={settings.haptics} onChange={(v) => settings.set('haptics', v)} testID="toggle-haptics" />} />
        <Row
          title="Cue reminder"
          sub="One nudge before your usual session"
          right={<Value>{labels.cueReminder}</Value>}
          onPress={() => setPicker('cueReminder')}
          testID="row-reminder"
        />
        <Section>Privacy</Section>
        <Row title="What is stored" right={<Value>›</Value>} onPress={nav.onWhatIsStored} testID="row-stored" />
        <Row title="Auto-delete originals" right={<Value>{labels.autoDelete}</Value>} onPress={() => setPicker('autoDelete')} testID="row-auto-delete" />
        <Row title="Export all my data" right={<Value>›</Value>} onPress={doExport} testID="row-export" />
        <Row title="Delete account" right={<Value>›</Value>} onPress={nav.onDeleteAccount} testID="row-delete" />
        <Row title="Help" muted right={<Value>{`About · ${version}`}</Value>} onPress={nav.onHelp} last testID="row-help" />
      </ScrollView>

      {picker === 'name' && account ? (
        <NameSheet
          initial={account.name}
          onSave={async (name) => {
            await accountRepository.rename(name);
            close();
          }}
          onClose={close}
        />
      ) : null}
      {picker === 'cueReminder' ? (
        <ReminderSheet value={settings.cueReminder} onChange={(r) => settings.set('cueReminder', r)} onClose={close} />
      ) : null}
      {picker === 'units' ? (
        <OptionSheet title="Units" options={PICKERS.units} value={settings.units} onPick={(v) => {
            settings.set('units', v);
            close();
          }} onClose={close} />
      ) : null}
      {picker === 'defaultMovement' ? (
        <OptionSheet
          title="Default lift"
          options={PICKERS.defaultMovement}
          value={settings.defaultMovement}
          onPick={(v) => {
            settings.set('defaultMovement', v);
            close();
          }}
          onClose={close}
        />
      ) : null}
      {picker === 'frameRate' ? (
        <OptionSheet title="Frame rate" options={PICKERS.frameRate} value={settings.frameRate} onPick={(v) => {
            settings.set('frameRate', v);
            close();
          }} onClose={close} />
      ) : null}
      {picker === 'autoDelete' ? (
        <OptionSheet
          title="Auto-delete originals"
          options={PICKERS.autoDelete}
          value={settings.autoDelete}
          onPick={(v) => {
            settings.set('autoDelete', v);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </View>
  );
}

function Section({ children }: { children: string }) {
  return <SmallCaps size={12} style={{ paddingTop: space.s4, paddingBottom: space.s1 }}>{children}</SmallCaps>;
}

function Value({ children }: { children: string }) {
  return <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>{children}</Text>;
}

function FoundingBadge() {
  return (
    <View testID="founding-badge" style={{ height: 28, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.flare, borderRadius: radius.control, justifyContent: 'center' }}>
      <SmallCaps size={11} color={colors.text}>Founding</SmallCaps>
    </View>
  );
}

function Row({
  title,
  sub,
  right,
  bold,
  muted,
  last,
  onPress,
  testID,
}: {
  title: string;
  sub?: string;
  right: ReactNode;
  bold?: boolean;
  muted?: boolean;
  last?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.s3,
        minHeight: 48,
        paddingVertical: space.s2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: muted ? colors.text2 : colors.text, fontFamily: bold ? fontFamily.bodyBold : fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          {title}
        </Text>
        {sub ? <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

function SheetFrame({ children, onClose, testID }: { children: ReactNode; onClose: () => void; testID?: string }) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} testID={testID}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim }} accessibilityLabel="Close" testID="sheet-scrim" />
      <Sheet gap={12}>{children}</Sheet>
    </View>
  );
}

function OptionSheet<T extends string>({
  title,
  options: opts,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <SheetFrame onClose={onClose} testID="option-sheet">
      <SheetTitle size={20}>{title}</SheetTitle>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
        {opts.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => onPick(o.value)}
            testID={`pick-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === value }}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}
          >
            <Text style={{ color: colors.text, fontFamily: o.value === value ? fontFamily.bodyBold : fontFamily.body, fontSize: 17, lineHeight: 24 }}>
              {o.label}
            </Text>
            {o.value === value ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} /> : null}
          </Pressable>
        ))}
      </View>
    </SheetFrame>
  );
}

function ReminderSheet({
  value,
  onChange,
  onClose,
}: {
  value: Settings['cueReminder'];
  onChange: (r: Settings['cueReminder']) => void;
  onClose: () => void;
}) {
  const toggleDay = (d: number) =>
    onChange({ ...value, days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d] });
  return (
    <SheetFrame onClose={onClose} testID="reminder-sheet">
      <SheetTitle size={20}>Cue reminder</SheetTitle>
      <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
        One nudge with your current cue, before your usual session.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {DAY_NAMES.map((name, d) => (
          <Chip key={name} label={name} on={value.days.includes(d)} onPress={() => toggleDay(d)} testID={`day-${name}`} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REMINDER_TIMES.map((t) => (
          <Chip key={t} label={t} mono on={value.time === t} onPress={() => onChange({ ...value, time: t })} testID={`time-${t}`} />
        ))}
      </View>
      <Btn onPress={onClose} testID="reminder-done">
        Done
      </Btn>
    </SheetFrame>
  );
}

function NameSheet({ initial, onSave, onClose }: { initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0;
  return (
    <SheetFrame onClose={onClose} testID="name-sheet">
      <SheetTitle size={20}>Your name</SheetTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        testID="name-input"
        style={{
          height: 52,
          borderWidth: 1,
          borderColor: colors.text,
          borderRadius: radius.control,
          paddingHorizontal: space.s3,
          color: colors.text,
          fontFamily: fontFamily.body,
          fontSize: 17,
        }}
      />
      <Btn onPress={() => (valid ? onSave(name.trim()) : undefined)} testID="name-save">
        Save
      </Btn>
    </SheetFrame>
  );
}
