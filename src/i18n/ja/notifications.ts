// REVIEW: machine-drafted Japanese, needs a native speaker before release.
import type { Strings } from '../types';
import type { notifications as en } from '../en/notifications';

export const notifications: Strings<typeof en> = {
  'notifications.onboarding.title': "通知をオンにしましょう。",
  'notifications.onboarding.body': "Catchlineが通知を使うのは、リフトのトラッキング完了をお知らせするときだけです。宣伝は送りません。いつでもオフにできます。",
  'notifications.turnOn': "通知をオンにする",
  'notifications.openSettings': "設定を開く",
  'notifications.notNow': "今はしない",
  'notifications.reask.title': "リフトの準備ができたらお知らせしますか？",
  'notifications.reask.body': "アプリを離れてもトラッキングは続きます。通知をオンにすると、完了時にCatchlineがお知らせします。",
  'notifications.reask.notNow': "今はしない",
  'notifications.ready.title': "リフトの準備ができました",
  'notifications.ready.body': "タップして、動画の上でバーの軌道を見ましょう。",
  'notifications.ready.failedTitle': "動画をトラッキングできませんでした",
  'notifications.ready.failedBody': "タップして、原因と次に試せることを確認できます。",
  'notifications.nudge1.title': "最初のバーの軌道は約1分でできます",
  'notifications.nudge1.body': "カメラロールからリフトの動画を選ぶだけ。Catchlineがこのスマホの中でバーの軌道を描きます。",
  'notifications.nudge2.title': "リフトの動画はありますか？",
  'notifications.nudge2.body': "Catchlineを開いて、バーの軌道とスピードを見てみましょう。動画はスマホの外に出ません。",
  'notifications.nudge3.title': "動画1本で十分です",
  'notifications.nudge3.body': "次のリフトを真横から撮って、バーの軌道が描かれるのを見てみましょう。",
};
