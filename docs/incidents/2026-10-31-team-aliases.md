# Repeated scheduled-update failure on round 1669

Prediction runs #52 (41174230912), #53 (41202147133), and the fallback initializer's prediction job failed in `fetch_toto` with `Unknown team: モンテディオ山形`. They were repeatedly retrieving valid fixtures, then failing at a deterministic name lookup. #53 is the notification reported by the owner. Its failed update status was published while retaining the previous valid forecast; a successful Pages build therefore does not mean prediction generation succeeded.

The landing page uses short club names, whereas the official lot-information page uses full names. Round 1669 includes ten previously unregistered full-name aliases: 山形、藤枝、栃木Ｃ、札幌、奈良、群馬、山口、鹿児島、讃岐、松本. Both official pages were compared by round, official game ID, match number, date, and home/away position before adding these aliases to the existing internal team IDs. No IDs or names were replaced and no league list was hard-coded.

`docs/sources/toto-1669-team-aliases.json` records source URLs, capture time, original HTML digests and the ten pairings. The reduced official toto HTML fixture retains the toto block and round ID; parsing was checked to match the full page. The J.League fixture contains only the 13 corresponding games from the saved official schedule (10 J2 / 3 J3).

Registry errors now stop the current operation without repeating the same requests three times. Transient network retries remain; unknown or ambiguous teams still fail closed, preserve earlier data and produce a visible failed status. Scheduled runs remain every three hours with the existing fallback. GitHub email preferences were not changed, and errors are not masked as successful runs.

Validation: 120 Node tests pass, including all 13 official round-1669 full-name joins, ID consistency, rejection of unknown teams, and deterministic-error retry stopping. The existing UI asset-version check passes. Production adoption requires owner merge approval; successful fixture verification alone is not successful publication. Other unverified full-name variants are still rejected rather than inferred from substrings.
