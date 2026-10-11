import { Text, type TextStyle } from 'react-native';
import { colors } from '../design/tokens';
import { fontFamily } from '../design/typography';

// Sometype Mono has no small-caps feature, so fake it: capitals and digits at
// full size, lowercase set in capitals at ~78%.
export default function SmallCaps({
  children,
  size = 13,
  color = colors.text2,
  tracking = 0.08,
  style,
}: {
  children: string;
  size?: number;
  color?: string;
  tracking?: number;
  style?: TextStyle;
}) {
  const runs: { small: boolean; text: string }[] = [];
  for (const ch of children) {
    const small = ch !== ch.toUpperCase();
    const last = runs[runs.length - 1];
    if (last && last.small === small) last.text += ch;
    else runs.push({ small, text: ch });
  }
  return (
    <Text
      style={[
        {
          color,
          fontFamily: fontFamily.mono,
          fontSize: size,
          lineHeight: Math.round(size * 1.4),
          letterSpacing: size * tracking,
        },
        style,
      ]}
    >
      {runs.map((r, i) =>
        r.small ? (
          <Text key={i} style={{ color, fontSize: Math.round(size * 0.78), letterSpacing: size * tracking }}>
            {r.text.toUpperCase()}
          </Text>
        ) : (
          r.text
        )
      )}
    </Text>
  );
}
