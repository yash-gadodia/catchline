# Catchline non-English markets: research report (19 Nov 2026)

Used all 12 searches. iOS shares are StatCounter mobile web-traffic share for Oct 2026 (pulled from gs.statcounter.com CSV), which is a proxy for ownership, not a device census.

## 1. Mainland China

- **Rule:** MIIT's 2023 notice requires app filing for anyone providing "internet information services" in the mainland. Existing apps had until 31 Mar 2024, and stores may not distribute unfiled apps ([AppInChina filing guide](https://appinchina.co/blog/the-complete-guide-to-chinas-mobile-app-filing/), [MacRumors](https://www.macrumors.com/2023/10/03/apple-adopts-tighter-china-app-store-rules/)).
- **Apple's wording:** MIIT "requires that *some* apps" hold an ICP filing number, entered "if applicable"; no exceptions are listed ([App Store Connect reference](https://developer.apple.com/help/app-store-connect/reference/app-information/)).
- **Enforcement today:** AppInChina (updated 28 Jul 2026) says Apple enforces filing for Chinese companies, while global accounts are prompted but can still publish without one. It warns removal could come at short notice, citing the 2020 purge of 26,575 games ([source](https://appinchina.co/blog/how-can-i-publish-on-the-apple-app-store-china/)). This is a vendor's view; I found no official confirmation and no evidence of a mass removal of unfiled foreign apps.
- **Foreign individual:** a filing normally needs a Chinese subsidiary (6-12 months) or a local partner (about one month); an overseas registration alone does not qualify (same source). Whether a foreign individual can file is unconfirmed; no source addressed it.
- **No server, no account:** a 2023 Chinese industry article says standalone offline apps need no filing ([woshipm](https://www.woshipm.com/share/5883825.html)). This is secondary commentary; I did not reach the MIIT text. Any analytics, in-app purchase or remote config call weakens the "offline" argument.
- **Video and body data:** no specific rule found. PIPL review covers privacy policy localisation, SDK disclosure and consent; on-device processing reduces exposure, but that is my inference.

**Options:**
1. Stay listed in mainland China via the global account and accept removal risk. Cost is zero.
2. Use a local publishing partner only if China revenue justifies it.
3. Add Traditional Chinese for Taiwan (iOS 51.6%), Hong Kong (46.3%), Singapore (42.4%) and Malaysia (36.8%). This is the best return of the three.

## 2. Chinese lifting community

- **Size:** amateur weightlifting is "strong in China, but not big"; elite lifting is state-run and powerlifting is grassroots and growing on short video ([Jakarta Post/AFP 2021](https://www.thejakartapost.com/life/2021/08/04/chinas-amateur-weightlifters-fight-short-fat-stigma.html), [Radii](https://radii.co/article/what-powerliftings-struggles-in-china-say-about-the-countrys-changing-gym-culture)). CrossFit had about 120 boxes in 2018 ([SCMP](https://www.scmp.com/sport/outdoor/crossfit-strongman/article/2175024/chinas-crossfit-explosion-down-xi-jinping-and-lucky)). No current niche size was found.
- **Apps:** Chinese-language results surfaced Metric VBT and VBTgo ([metric.coach/zh](https://www.metric.coach/zh), [VBTgo](https://apps.apple.com/app/id6741767872)). I found nothing on Keep, WeChat groups or WL Analysis usage in China.
- **Posting as a foreigner:**
  - **Xiaohongshu:** registers with foreign numbers. A business account costs RMB 600 with licence verification ([Dragon Trail, 2024](https://dragontrail.com/resources/blog/how-to-register-for-a-xiaohongshu-account-from-overseas)). Foreign-number users may have been split into "rednote" from 8 Dec 2025 (unconfirmed, single source).
  - **Douyin:** verification needs a Chinese ID or residence permit, so effectively closed ([TechNode](https://technode.com/2025/01/17/douyin-international-registration-claim-debunked-over-10000-fake-foreign-user-accounts-removed/)).
  - **Bilibili:** unconfirmed.

## 3. Country table

Scene figures: CrossFit Open 2024 interim registrations by nationality ([BarBend](https://barbend.com/?p=238355)) and affiliate counts where found. "n/f" means not found. The platforms column is my general knowledge, not sourced this session.

| Country | iOS % | Scene data | Language | Main platforms |
|---|---|---|---|---|
| USA | 52.0 | Open 136,039; ~5,000 affiliates; USAW 20.5-23k members | en | Instagram, YouTube, TikTok, Reddit |
| UK | 50.1 | Open 24,706 | en | Instagram, TikTok, YouTube |
| Australia | 62.1 | Open 16,502 | en | Instagram, TikTok |
| Canada | 64.7 | Open 15,027; 600+ affiliates | en, fr | Instagram, TikTok |
| Germany | 27.7 | Open 3,569 at week 3 (undercount) | de | Instagram, YouTube |
| France | 35.8 | Open 24,081; ~700 affiliates (undated) | fr | Instagram, YouTube, TikTok |
| Spain | 27.2 | n/f | es | Instagram, TikTok |
| Italy | 37.9 | n/f | it | Instagram, TikTok |
| Brazil | 26.2 | Open 19,963; second in affiliates | pt-BR | Instagram, WhatsApp, YouTube |
| Mexico | 25.9 | n/f | es-MX | Facebook, Instagram, TikTok |
| Colombia | 26.3 | n/f | es | Instagram, Facebook, TikTok |
| Japan | 53.9 | n/f | ja | X, Instagram, YouTube, LINE |
| South Korea | 39.3 | 325 affiliates (Apr 2026) | ko | Instagram, YouTube, Naver, KakaoTalk |
| Taiwan | 51.6 | n/f | zh-Hant | Instagram, Threads, LINE, YouTube |
| Indonesia | 21.2 | n/f | id | Instagram, TikTok, WhatsApp |
| Thailand | 24.3 | n/f | th | Facebook, LINE, TikTok |
| Iran | 9.2 | n/f | fa | Instagram (via VPN), Telegram |
| Turkey | 23.1 | n/f | tr | Instagram, YouTube, TikTok |
| Egypt | 17.9 | n/f | ar | Facebook, TikTok, Instagram |

- **Iran:** no App Store storefront or Apple payments because of sanctions (my prior knowledge, not re-verified).
- **Sources for scene data:** CrossFit global total was 9,899 affiliates in Mar 2025, and the 2025 Open drew 233,815, down 32% ([Fitness Avenue](https://www.fitnessavenue.ca/blogs/post/how-many-crossfit-gyms-are-there-2026-data-by-country), [Morning Chalk Up](https://morningchalkup.com/2025/02/25/2025-crossfit-open-registration-continues-to-lag/)). USAW figures conflict between its own documents ([usaweightlifting.org](https://www.usaweightlifting.org/usa-weightlifting-2025-28-strategic-plan)). No federation membership was found for any other country.

## 4. Top 8 by reachable iPhone lifters

Proxy: Open 2024 interim registrations × iOS share. Assumptions: Open sign-ups track the barbell-video audience, and lifters own iPhones at the national rate (likely an undercount in Android-majority countries, since gym members skew affluent). Scale 2024 figures down about 30% for today.

| Rank | Country | Arithmetic | Reachable |
|---|---|---|---|
| 1 | USA | 136,039 × 0.520 | ~70.7k |
| 2 | UK | 24,706 × 0.501 | ~12.4k |
| 3 | Australia | 16,502 × 0.621 | ~10.2k |
| 4 | Canada | 15,027 × 0.647 | ~9.7k |
| 5 | France | 24,081 × 0.358 | ~8.6k |
| 6 | Brazil | 19,963 × 0.262 | ~5.2k |
| 7 | South Korea | 325 affiliates × ~30 per affiliate × 0.393 | ~3.8k (estimate) |
| 8 | Japan, Italy or Spain | no scene data | unranked |

- The Korea multiplier comes from the US (27) and France (34) Open-per-affiliate ratios.
- Germany's lower bound is about 1.0k (3,569 × 0.277).
- For 8th, Japan has the best iOS share (53.9%) and is already localised.

**Missing languages:**
- **Traditional Chinese:** add now. It is cheap given Simplified exists, and Taiwan and Hong Kong are near 50% iOS.
- **Russian:** second. It covers Kazakhstan (32.5% iOS), Armenia (33.2%), Georgia (32.1%) and Uzbekistan (18.0%). Check Apple's payment status in Russia itself first.
- **Turkish (23.1%), Indonesian (21.2%), Thai (24.3%):** low priority.
- **Arabic:** needs right-to-left layout for an 18% iOS market in Egypt; defer.
- **Persian:** pointless without a storefront.

## 5. What iPhone-only cannot reach

WL Analysis has 185K+ Android installs and 1.1K ratings ([AppGoblin](https://appgoblin.info/apps/com.karolsmolak.wlanalysis)), against roughly 5,000+ estimated iOS installs and 40-45 ratings ([AppWisp](https://appwisp.com/app/ios/com.karolsmolak.WL-analysis)). The two figures use different methods, but the Android skew is clear.

Android share, which is the unreachable portion:

| Region | Android share |
|---|---|
| Worldwide | 72.4% |
| Iran | 90.7% |
| Egypt, Uzbekistan | 82% |
| Indonesia, Bulgaria, Turkey, Thailand | 76-79% |
| Colombia, Brazil, Mexico | 74% |
| Germany, Spain | 72-73% |
| China | 69.5% |
| Kazakhstan, Georgia, Armenia | 67-68% |
| South Korea | 60.7% |
| Anglosphere, Japan, Taiwan | 35-50% |

**Implication:** an iPhone-only app cannot reach about two-thirds to nine-tenths of lifters in the traditional weightlifting powers. "#1 worldwide" is credible only as "#1 on iPhone" or "#1 by revenue" across the Anglosphere, Japan, Taiwan, France and Korea. Number one by users needs Android.

## 6. Localisation beyond strings

- **Spanish (confirmed):** Spain uses *arrancada* and *dos tiempos*, with *cargada* and *envión* as its phases. Cuban sources use *arranque* and *envión* ([UMH thesis](https://dspace.umh.es/bitstream/11000/40444/1/TFG%20Llor%c3%a9ns%20P%c3%a1ez%2c%20Nacho.pdf), [EcuRed](https://www.ecured.cu/Arranque)). Mexico and Colombia usage is unconfirmed; check their federation rulebooks before splitting es-MX.
- **Other languages (my knowledge, unverified; have a native lifter check):**
  - pt-BR: *arranco / arremesso*
  - fr: *arraché / épaulé-jeté*
  - de: *Reißen / Stoßen*
  - it: *strappo / slancio*
  - ja: スナッチ / クリーン&ジャーク
  - ko: 인상 / 용상
  - zh: 抓举 / 挺举 (Traditional 抓舉 / 挺舉)
  - ru: *рывок / толчок*
  - tr: *koparma / silkme*
- **Keyword sources:** Apple Search Ads suggestions per storefront, the incumbents' local listings, federation rulebooks, and Naver, Xiaohongshu and Instagram hashtags. None tested this session.
- **Pricing:** set one base price and Apple equalises across 174 storefronts and 43 currencies with 800 price points. Manual per-storefront prices are allowed but then are not auto-adjusted ([Apple](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/)). Apple has no purchasing-power tier; you set lower prices by hand for Brazil, Mexico, Colombia, Turkey, Indonesia, Thailand and Egypt.

## Ranked recommendation

1. Win the USA, UK, Australia and Canada first: about 100k of the roughly 120k reachable lifters in the model.
2. Push the existing French, Japanese and Korean localisations, with native terminology review.
3. Add Traditional Chinese for Taiwan and Hong Kong.
4. Hand-set lower prices for Brazil, Mexico, Colombia and Turkey.
5. Leave the mainland China listing as is and seed Xiaohongshu with a personal account; no partner or filing spend yet.
6. Add Russian only after checking Kazakhstan demand.
7. Skip Persian, Arabic, Thai and Indonesian until there is an Android app.
8. Restate the goal as "#1 on iPhone", or plan for Android.
