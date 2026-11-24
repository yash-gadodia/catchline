import type { Strings } from '../types';
import type { common as en } from '../en/common';

export const common: Strings<typeof en> = {
  'common.launch.title': "Catchlineの起動に時間がかかっています",
  'common.launch.body': "リフトのデータはこのiPhoneに安全に保存されています。もう一度お試しください。",
  'common.launch.retry': "もう一度試す",
  'common.crash.title': "こちら側で問題が起きました",
  'common.crash.body': "リフトのデータは無事です。もう一度お試しください。",
  'common.update.title': "Catchlineをアップデート",
  'common.update.body': "このバージョンのCatchlineは古くなっています。トラッキングを続けるには、App Storeからアップデートしてください。リフトのデータはこのiPhoneに残ります。",
  'common.update.button': "アップデート",
  'common.update.soon.title': "新しいCatchlineがあります",
  'common.update.soon.body': "アップデートで最新の修正が入ります。リフトのデータはこのiPhoneに残ります。",
  'common.update.later': "今はしない",
};
