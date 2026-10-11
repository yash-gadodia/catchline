import LiftPickerScreen from '../../src/features/onboarding/LiftPickerScreen';
import { useOnboarding } from '../../src/features/onboarding/store';
import { useFlow } from '../../src/features/onboarding/useFlow';

export default function LiftsRoute() {
  const { go } = useFlow('film');
  const { lifts, focus, units, setLifts } = useOnboarding();
  return (
    <LiftPickerScreen
      initial={{ lifts, focus, units }}
      onContinue={(pick) => {
        setLifts(pick.lifts, pick.focus, pick.units);
        go('lifts');
      }}
      onSkip={() => go('lifts')}
    />
  );
}
