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
};
