# JustTheBuilder Logo + Embed Format Design

**Date:** 2026-07-18  
**Status:** Approved  

## Decisions

| Item | Choice |
|------|--------|
| Bot avatar | Fresh blueprint / stacked-blocks mark, gold on black, monogram JTB — no wrench/circuits |
| Embed format | Global: split dense bodies, pull URLs/emails into fields; inject structured `sections` for welcome/about/faq |
| EarnCord | Copy pack in `docs/EARNCORD_EMBEDS.md` for re-post |

## Deliverables

- `assets/logo.png` — new avatar (upload in Discord Developer Portal → App Icon / Bot Icon)
- `src/utils/builder/embedFactory.js` — `formatEmbedBody()` + fields
- Interview inject uses sections
- EarnCord embed markdown pack
