# Player Page Overrides

- Desktop uses two columns only: `Bingo + 战术道具` and `队长定位`.
- No task list, task tab or direct task entry exists outside the Bingo grid.
- Bingo is a 5×5 grid with 19 photo clues and 6 direct tasks. A cell shows public state and score but hides task details until activation.
- Region progress is read-only. Only staff approval of that team's next entrance advances its region; all 19 photos update together while task IDs, points and completion states remain intact. Each team progresses independently.
- The card hand sits directly below Bingo. Cards fan from the bottom and lift on hover/focus; touch users scroll horizontally.
- Card art is original geometric HUD artwork. Category mapping: intel/cyan, boost/lime, control/magenta.
- Hand, detail, reward and cast share src/cards/TacticCard.tsx. Entry animation runs on an inner layer; selection lift runs on the button. CardRewards waits for active native dialogs before showing new rewards. See card-rewards.md for timing and accessibility.
- Read all task titles/rules from the existing task catalog. Artwork and animation work must not invent, rewrite or add tasks.
- The location column stays sticky on desktop and moves below the main column on narrow screens.
- Use neutral stage names (`A 区 / B 区 / C 区`) and rhythm-game team names; do not use Hangzhou scenery as theme or team identity.
- Keep the page in the foreground notice, offline behavior, finish marker and event panel visible in the location column.
