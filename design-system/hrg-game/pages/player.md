# Player Page Overrides

- Desktop uses two columns only: `Bingo + 战术道具` and `队长定位`.
- No task list, task tab or direct task entry exists outside the Bingo grid.
- Bingo is a 5×5 grid with 19 photo clues and 6 direct tasks. A cell shows public state and score but hides task details until activation.
- Region progress is read-only. Only staff approval of that team's next entrance advances its region; all 19 photos update together while task IDs, points and completion states remain intact. Each team progresses independently.
- Switch the five shared boards with the two arrows flanking the main Bingo. No team-thumbnail tabs or clickable background boards remain. Keyboard arrows and horizontal swipe still switch task categories, never player identity or region. On narrow screens the arrows sit on the upper side edges without covering cells or the motion toggle; keep 44px touch targets.
- First entry shows the complete, confirmed seven-part activity rules in a required native dialog. Acknowledgement is stored per game/account; the book button reopens the rules. This preference is not authorization to skip an opening puzzle.
- The task area is replaced by the next region's opening puzzle after the fifth scoring task is approved, or when the team actively chooses to leave. Pending submissions reserve task slots but do not advance the region. Staff approval is still the only region transition; rejection and refresh cannot return to old tasks. Keep location and ability cards available during this flow.
- Each region has one additional opening photo from the original 66 photos, outside P01–P19 and outside the five-task quota. The three exact photos are awaiting confirmation. Until staff uploads a confirmed reference, show a clear pending state and disable opening-proof submission; do not substitute a task photo.
- After the last region reaches its quota, show the endpoint instructions, not a fourth region. Only staff can confirm completion; the confirmed state reads “已完赛”. See `docs/region-opening-flow.md` for server commands and verification.
- The card hand sits directly below Bingo. Cards fan from the bottom and lift on hover/focus; touch users scroll horizontally.
- Card art is original geometric HUD artwork. Category mapping: intel/cyan, boost/lime, control/magenta.
- Hand, detail, reward and cast share src/cards/TacticCard.tsx. Entry animation runs on an inner layer; selection lift runs on the button. CardRewards waits for active native dialogs before showing new rewards. See card-rewards.md for timing and accessibility.
- Read all task titles/rules from the existing task catalog. Artwork and animation work must not invent, rewrite or add tasks.
- The location column stays sticky on desktop and moves below the main column on narrow screens.
- Use neutral stage names (`A 区 / B 区 / C 区`) and rhythm-game team names; do not use Hangzhou scenery as theme or team identity.
- Keep the page in the foreground notice, offline behavior, finish marker and event panel visible in the location column.
