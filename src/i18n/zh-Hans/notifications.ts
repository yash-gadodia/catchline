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
  'notifications.feedback.title': "Catchline 用得怎么样？",
  'notifications.feedback.body': "告诉我们哪里需要改进、还缺什么。只需一分钟。",
  'notifications.nudge1.title': "你的第一条杠铃轨迹只需约一分钟",
  'notifications.nudge1.body': "从相册里选一段举重视频，Catchline 会在你的手机上画出杠铃轨迹。",
  'notifications.nudge2.title': "有举重视频吗？",
  'notifications.nudge2.body': "打开 Catchline，看看杠铃轨迹和杠铃速度。视频不会离开你的手机。",
  'notifications.nudge3.title': "一段视频就够了",
  'notifications.nudge3.body': "下次从侧面拍一段举重，看看画在上面的杠铃轨迹。",
};
