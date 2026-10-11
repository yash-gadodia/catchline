v6 feedback, round two. This supersedes the pricing section of my previous note. New research has landed and it changes the answer.

1. STILL URGENT — REMOVE THE END-TO-END ENCRYPTION CLAIM.
Unchanged from the last note. The WhatsApp link preview footer says "parallax.sg · end-to-end encrypted". That is false: the product works by sending raw text to a server and a language model. Replace it with something true, such as "nothing shows until you both write" or "deleted after 30 days", and sweep every other screen for security or privacy claims held to the same standard.

2. SUPERSEDED — DELETE THE PAYWALL ENTIRELY. DO NOT DESIGN THE TWO PRICING OPTIONS I ASKED FOR.
My previous note asked for two pricing designs to compare. Ignore that. The research came back with a clear position: there is no honest paid tier in this product, and a supporter or tip tier is not worth building either. The reasoning: the free half is the good half, a purchase surface that unlocks nothing invites App Review scrutiny and user disbelief, and the people who might pay are a handful of friends who can give money directly without an in-app product existing.

So:
- Delete PaywallC6 and Manage6.
- Delete the pricing toggle in the prototype controls. There is only one world now.
- Keep Free6 as the only subscription screen, reached from You. Its current copy is already right: "There isn't one." Add one line making the promise a ratchet: anything free today stays free forever. That matters because the single loudest grievance in competitor reviews is not price, it is something that used to be free going behind a paywall.
- Remove the paywall gate from "Let Marcus write his side" in the result screen. The partner side is free. That also resolves the objection in my last note about money changing hands before the partner has written anything.
- Take the strongest position the paired competitors structurally cannot: the partner never sees a paywall, ever, under any condition. Say it plainly on the partner screen.
- One rule to honour in copy anywhere retention is mentioned: never gate something the user has already generated but has not yet read. A bridge, a what's-underneath, or a partner's side that exists must stay readable forever.

3. THE SAFETY SCREEN NUMBERS ARE INCOMPLETE, AND THE DESIGN AND THE CODE DISAGREE.
Screen F currently lists NAVH 1800 777 0000 and 999. The shipped app lists a different set entirely: SOS 1767, IMH 6389 2222, AWARE 1800 777 5555, findahelpline.com. Those two lists serve different situations and both need to be right.

For the violence and coercion stop screen, show: 999 for immediate danger, 70999 as an SMS route for when it is not safe to speak, NAVH 1800 777 0000, and AWARE 1800 777 5555 with its real weekday hours rather than implying 24 hours. Add the SMS route explicitly with a line explaining what it is for, because the person who cannot safely make a call is exactly the person this screen exists for.

For self-harm or crisis content, a separate route: SOS 1767, and CareText on 9151 1767 for text rather than voice.

Do not add IMH 6389 2222 to any new screen for now. It is live in the shipped app and could not be verified from an official source; it is being checked by hand.

Design both variants of the stop screen — violence, and self-harm — rather than one screen trying to cover both.

4. SINGAPORE SPECIFICS WORTH PUTTING IN THE PRODUCT.
Five things are genuinely local rather than decorative, and the first three should show up in the chip options and example copy:
- Money sent to parents is a legal duty here, not a boundary problem. Never let the app read "he sends his mother money every month" as enmeshment.
- A BTO flat is a dated deadline that couples plan a marriage around, not a metaphor for commitment.
- National Service is a compulsory two-year separation, not a choice either person made.
- Avoid the word "counselling" as a suggestion. In Singapore it points at mandatory pre-divorce-filing programmes and reads as an escalation.
- Chinese New Year and whose family comes first is a recurring, dated, specific conflict worth having as a topic chip.

Add chip options that reflect these: the flat, my parents, his or her parents, CNY, the helper, work hours, NS. They should sit alongside the existing generic ones, not replace them.

5. UNCHANGED FROM THE LAST NOTE.
- Verify the domain parallax.sg is actually owned before it appears in a shared prototype.
- The account screen shows jo@icloud.com. Sign in with Apple often returns a private relay address; make sure it looks right with one of those.
- There is still no failure state on the web side. If generation fails while the partner is writing on parallax.sg, nothing is designed for it. He is the least invested person in the flow.

Everything praised in the last note still stands and should survive these changes: the partner-side anti-ambush work, the notification screen, "Marcus's own writing stays his", the single contextual read, and the deletion copy.
