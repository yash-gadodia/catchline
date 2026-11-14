// REVIEW: machine-drafted Simplified Chinese, needs a native speaker before release.
import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  'notifications.onboarding.title': "打开通知。",
  'notifications.onboarding.body': "Catchline 只在试举追踪完成时通知你。没有营销信息，随时可以关闭。",
  'notifications.turnOn': "打开通知",
  'notifications.openSettings': "打开设置",
  'notifications.notNow': "以后再说",
  'notifications.reask.title': "试举准备好时通知你？",
  'notifications.reask.body': "离开 App 后追踪仍会继续。打开通知，完成时 Catchline 会告诉你。",
  'notifications.reask.notNow': "以后再说",
  'notifications.ready.title': "你的试举准备好了",
  'notifications.ready.body': "点按查看视频上的杠铃轨迹。",
  'notifications.ready.failedTitle': "我们没能追踪你的视频",
  'notifications.ready.failedBody': "点按查看原因，以及接下来可以怎么做。",
};
