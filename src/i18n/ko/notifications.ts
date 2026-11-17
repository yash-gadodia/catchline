// REVIEW: machine-drafted Korean, needs a native speaker before release.
import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  'notifications.onboarding.title': "알림을 켜세요.",
  'notifications.onboarding.body': "Catchline은 리프트 트래킹이 끝났을 때 알려드리는 용도로만 알림을 써요. 광고는 없고, 언제든 끌 수 있어요.",
  'notifications.turnOn': "알림 켜기",
  'notifications.openSettings': "설정 열기",
  'notifications.notNow': "나중에",
  'notifications.reask.title': "리프트가 준비되면 알려드릴까요?",
  'notifications.reask.body': "앱을 나가도 트래킹은 계속돼요. 알림을 켜면 끝났을 때 Catchline이 알려드려요.",
  'notifications.reask.notNow': "나중에",
  'notifications.ready.title': "리프트가 준비됐어요",
  'notifications.ready.body': "탭해서 영상 위의 바 궤적을 확인하세요.",
  'notifications.ready.failedTitle': "영상을 트래킹하지 못했어요",
  'notifications.ready.failedBody': "탭해서 이유와 다음에 해볼 것을 확인하세요.",
  'notifications.nudge1.title': "첫 바벨 궤적은 1분이면 됩니다",
  'notifications.nudge1.body': "카메라 롤에서 리프팅 영상을 고르세요. Catchline이 휴대폰 안에서 바벨 궤적을 그려 줍니다.",
  'notifications.nudge2.title': "리프팅 영상이 있나요?",
  'notifications.nudge2.body': "Catchline을 열어 바벨 궤적과 속도를 확인해 보세요. 영상은 휴대폰 밖으로 나가지 않아요.",
  'notifications.nudge3.title': "영상 하나면 충분해요",
  'notifications.nudge3.body': "다음 리프팅을 옆에서 촬영하고 그 위에 그려지는 바벨 궤적을 확인하세요.",
};
