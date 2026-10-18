---
'@vex/platform-web': minor
---

Chat lines render Twitch's message and notice types. A GIF from Twitch's GIF picker is a new `gif` token (an image from GIPHY's CDN, still under reduced motion), so code that switches on `Token['kind']` needs a case for it. `ChatLine` gains `messageType` (highlighted, intro and message-effect lines are set off, a gigantified emote is drawn large) and `system`: a sub notice with the user's message shows its system line over a normal chat line, with their colour, badges and emotes (from doomtp-bot's new notification `fragments`, `badges` and `color`). `pairRedemptions` folds a redemption's notice into the chat message sent with it.
