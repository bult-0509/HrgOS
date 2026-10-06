# HRG Game Design System

**Updated:** 2026-09-23  
**Direction:** 本机赛事控制台 / Competitive Operations UI  
**References:** Showreel 的固定信息轨与高密度网格、Aceternity 的克制景深、Uiverse 的组件反馈、Anime.js 的错峰节奏。

## Brand position

- 这是竞技活动工具，不是杭州城市导览，也不使用西湖人文意象。
- 队伍以音游名称命名，例如 `Phigros队`、`Arcaea队`、`CHUNITHM队`。
- 杭州仅作为活动地点出现；区域采用 `A 区 / B 区 / C 区` 等中性赛段名称。

## Tokens

| Role | Value |
|---|---|
| Background | `#070907` |
| Surface | `#0D100E` |
| Raised surface | `#141815` |
| Primary text | `#F5F7F2` |
| Secondary text | `#9BA59D` |
| Border | `#2B312C` |
| Primary / active | `#C8FF32` |
| Information | `#42D9FF` |
| Event / control | `#FF4F9A` |
| Warning | `#FF9E45` |
| Finished | `#F6C84F` |

- Font: local `Alimama FangYuanTi VF`; no external font request.
- Corner radius: 2–8px for controls and panels; 12px is reserved for game cards.
- Shadows: only for floating cards, dialogs and active feedback. Default panels use borders, not elevation.
- Grid: visible technical grid may be used as a low-contrast field texture.

## Information architecture

- Player: a strict two-column desktop layout. Main column contains Bingo and cards; right column contains live location.
- Staff: fixed operation rail + dense workspace. On mobile, navigation becomes a bottom bar.
- Login: competition statement on the left, high-contrast access panel on the right.

## Component rules

- Bingo cells expose number, score, difficulty color and public state only. Opening a photo cell reveals the reference image, not the task. Its task title and instructions require staff-approved photo replication; direct cells need no photo search.
- Tactical cards use an original fanned deck, category color and short deal/play motion. Do not copy commercial game art.
- Data tables, audit queues and maps prioritize scan speed over decoration.
- Buttons use flat fills or single borders. Primary action is lime; danger remains red.
- All actions must work by click, touch and keyboard. Hover is never required.

## Motion

- Shared timing: instant 110ms, fast 180ms, base 320ms, slow 560ms.
- Arrival easing: `cubic-bezier(0.16, 1, 0.3, 1)`; spring feedback: `cubic-bezier(0.2, 0.9, 0.22, 1.18)`.
- Grid entrance: 520ms with 35ms stagger. Card deal: 560ms with 80ms stagger.
- Press feedback stays under 120ms. Dialog exits use 150ms and remain faster than their 360ms entrance.
- Continuous motion is restricted to functional live states: location scan, online signal and pending-review clock.
- Animate `transform` and `opacity`; avoid width, height, top and left animation in interaction paths.
- Under `prefers-reduced-motion`, duration and stagger delay both become zero so every element renders immediately.

## Accessibility and responsive checks

- Visible focus ring uses `#C8FF32`.
- Maintain at least 4.5:1 body-text contrast.
- Use Lucide icons; no emoji as icons.
- Verify 375px, 768px, 1024px and 1440px.
- Mobile may horizontally scroll the card hand, but must not create page-level horizontal overflow.
- Keep fixed navigation from covering actionable content.
