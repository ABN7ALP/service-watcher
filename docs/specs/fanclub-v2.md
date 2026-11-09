# Fan Club v2 — Server Spec

Status: server implementation (this PR). Client UI is a separate follow-up PR.

## Why

A full code review of the current fan-club system (`fanClubController.js`,
`FanClubMembership`, `fanClubLevels.js`, `fanClubWeeklyFrameJob.js`) found:

1. Numbers were never redenominated when the rest of the economy moved ×10
   (join price 10 coins = $0.01, daily missions 15–50 pts vs. the 1 coin = 1 pt
   gift rate, Lv.20 threshold at 6,000,000).
2. Accounts linked to the club owner (same device/withdrawal wallet) earn fan
   points, can win the weekly "Contributor" frame, and inflate the club
   leaderboard.
3. Three different calendars are in play at once: a UTC calendar day for daily
   missions, a Monday-UTC week for the weekly-contributor frame, and a
   separate rolling-7-days window for the leaderboard's "weekly" tab.
4. `getLeaderboard` aggregates every `FanClubMembership` document on every
   request — no caching.
5. `fanclub-member-count-updated` is `io.emit(...)` — broadcast to every
   connected socket for every join, anywhere.
6. There is no leave endpoint, no inactivity concept, and no profanity check
   on the club name.
7. Joining does not require already following the owner.
8. The join flow writes its `GiftLog` row *outside* the wallet transaction —
   a crash between the two leaves an inconsistent record.

This spec fixes all eight findings. It keeps the existing wallet-ledger gift
path, the existing `User.fanClub.{name,emblemColorId,giftColorId}` identity
fields, and the existing fan-level badge system (`fanClubLevels.js`) as the
mechanisms to build on — this is a correctness and consistency pass, not a
redesign of what a fan club *is*.

## Data model

### `FanClubMembership` (existing collection, extended)

One row per (owner, member), unique on `{owner, member}` — unchanged shape
for the join relationship itself.

- `points` (existing) — lifetime fan points for this (owner, member) pair.
  Never decremented by inactivity. Drives the level badge
  (`fanClubLevels.js`), unchanged mechanism.
- `lastPointAt` (new, `Date`, defaults to the join moment) — timestamp of the
  most recent point award of *any* kind for this membership. This is the
  single source for the inactivity flag: `inactive = (now - lastPointAt) > 7
  days`. Updated by the one shared point-award function (see below) on every
  award, never touched anywhere else.
- `followBonusClaimed` (existing) — unchanged, still a one-time flag.
- Removed: `lastGiftCreditAt` and the "gift of the day" bonus it drove. The
  new points list below has no such mission; a gift already earns its 1:1
  points through the normal gift-point path.
- Removed from the *daily mission* role (moved to `FanClubDailyProgress`
  below, which is the actual atomic-cap mechanism now): `lastCheckInClaimedAt`,
  `lastChatCreditAt`. These fields are dropped from the schema; the
  migration does not need to touch them (no monetary value stored there to
  preserve — they were pure bookkeeping for a daily gate that is now
  tracked per-day in its own collection, exactly like `HostDailyStat` /
  `AgentDailyCounter` already do for other per-day caps in this codebase).

### `FanClubDailyProgress` (new)

One row per (owner, member, day), unique on `{owner, member, day}`. `day` is
a `Date` — the Damascus-midnight UTC instant from `poolWeek.js`'s
`getDayStartForDate`, exactly like `HostDailyStat.day`. A new calendar day is
a new document; there is no reset-at-boundary logic to get wrong.

- `chatMsgCount` (`Number`, default 0) — messages sent today in the owner's
  live room, counted toward the 3-message chat mission.
- `chatBonusAwarded` (`Boolean`, default false) — guards the one-time 50-pt
  chat bonus for today.
- `checkinAwarded` (`Boolean`, default false) — guards the one-time 50-pt
  manual check-in claim for today.
- `listenMinutes` (`Number`, default 0, capped at 30 by the write condition
  itself, not just by convention) — qualifying listening minutes credited
  today, drives the 10 pts/min listening mission.

### `FanClubWeekly` (new)

One row per (owner, member, weekStart), unique on `{owner, member,
weekStart}`. `weekStart` is the Damascus-Sunday week start from
`poolWeek.js`'s `getCurrentWeekBounds`/`getWeekBoundsForDate` — the *same*
week boundary used by the live-hours host pool, so there is exactly one
week calendar in the whole server, not a second one invented for fan clubs.

- `points` (`Number`, default 0) — `$inc`'d by the same amount as the
  lifetime `FanClubMembership.points` on every award, in the same call. This
  is the only source for "weekly contributor" and for the club leaderboard's
  weekly-points metric — no more `GiftLog` aggregation for either.

Note on cross-document atomicity: the lifetime increment
(`FanClubMembership.points`) and the weekly increment (`FanClubWeekly.points`)
are two independent atomic `findOneAndUpdate` calls, not one multi-document
transaction. Each individual write is race-safe on its own (no lost update,
no double-award — see "Atomicity" below); the two numbers could in theory
drift by a crash landing exactly between them. This mirrors the existing,
already-accepted precedent in this codebase for the same tradeoff
(`HostWeeklyStat.beansW/beansP`, documented in that model as "best effort,
not the money source of truth"). Fan points are not money and are not a
balance moved between two parties — they are a derived score — so this is
the right place to draw that line, not a shortcut around it.

### `User.fanClub` (existing embedded subdocument, extended)

- `memberCount` (new, `Number`, default 0) — total members, maintained by
  `$inc` inside the join and leave transactions. Not recomputed on every
  read.
- `activeCount` (new, `Number`, default 0) — members considered active *at
  the time of the last join/leave*. A member who simply goes quiet for 7
  days (no leave) does not decrement this counter in real time — by design,
  per the spec's own instruction that these are join/leave-transaction
  counters, not a continuously live recomputation. This is the same
  approximate-counter-plus-periodic-correction philosophy already used
  elsewhere in this codebase (e.g. wallet reconciliation), and is exactly
  why the migration below exists: it recomputes both counters exactly from
  `FanClubMembership`/`lastPointAt`, so drift never compounds forever.

## One calendar

Every date boundary in fan-club code goes through `server/utils/poolWeek.js`:

- Day boundary: `getDayStartForDate` / `getCurrentDayStart` (Damascus
  midnight).
- Week boundary: `getWeekBoundsForDate` / `getCurrentWeekBounds` (Damascus
  Sunday 00:00 through Saturday 23:59:59.999).

The old `startOfTodayUTC`, `currentWeekStartUTC` (Monday UTC), and
`startOfWeekUTC` (rolling 7 days) are all removed. There is exactly one
"today" and exactly one "this week" definition in the fan-club code, shared
with the host-pool feature that already established this calendar.

## Points

All of these funnel through one function,
`awardFanClubPoints(io, ownerId, memberId, delta, source)`, which is the
single place that:

1. Rejects `ownerId === memberId`, missing ids, `delta <= 0`.
2. Checks `linkageService.areLinked(memberId, ownerId)` — if linked, awards
   **zero** points and returns. This is the one choke point that fixes
   finding #2 for every point source at once (gifts, check-in, chat,
   listening, follow) rather than repeating the check at each call site.
3. `$inc`s `FanClubMembership.points` by `delta` and `$set`s `lastPointAt` —
   but only on an *existing* membership (`findOneAndUpdate` with no
   `upsert`). Nothing — not a gift, not listening, not a follow — creates a
   membership. Joining is the only way to become a member, matching the
   current (already-fixed-once) behavior.
4. If step 3 found a membership, also `$inc`s `FanClubWeekly.points` for the
   current week (upsert — the week doc is created on first use).
5. Fires `notifyIfLeveledUp` exactly as today, unchanged.

Sources that call it:

| Source | Amount | Cap / gate |
|---|---|---|
| Gift to owner | 1 point per coin spent (unchanged 1:1 rate) | linked → 0 (see above) |
| Daily check-in (manual claim) | 50 | once/day, atomic claim on `FanClubDailyProgress.checkinAwarded` |
| Chat in owner's room | 50 | once/day, after the 3rd message that day (`chatMsgCount` reaches ≥3, atomic claim on `chatBonusAwarded`) |
| Listening in owner's live room | 10/minute | up to 30 min/day (300 pts/day cap), see below |
| Follow the owner | 100 | once per (owner, member) ever, atomic claim on `followBonusClaimed` |

Join itself grants 100 points directly (the ticket price — see "Join" below)
via the same lifetime/weekly increment, but bypasses step 3's
"existing membership only" gate for the obvious reason that join is what
*creates* the membership.

### Listening points — reusing the live-hours tick

`socketService.js`'s `runLiveHoursTick` already walks every live room once a
minute and, for each room, makes one atomic "did this minute's claim
succeed" decision (`LiveSession.applyTick` returning non-null, combined with
the room meeting the pool's listener threshold — the exact `updatedSession
&& qualifies` condition that already gates `HostDailyStat.addQualifiedSeconds`).

Listening points for fan-club members are awarded from that *same* gate, for
each real listener present in the room (the deduped, non-host-linked list
`countQualifyingListeners` already computes internally for the pool's
listener count — extended to also return the actual listener id list, so
this reuses the one `groupLinkedAccounts` call already made per tick instead
of a second one):

- For each listener who has an existing `FanClubMembership` with this room's
  host as owner, atomically claim one listening-minute for today via
  `FanClubDailyProgress`, gated at `listenMinutes < 30`:
  ```js
  findOneAndUpdate(
    { owner: hostId, member: listenerId, day, listenMinutes: { $lt: 30 } },
    { $inc: { listenMinutes: 1 } }, { upsert: true, new: true }
  )
  ```
- If the claim matched (minute not yet capped today), award 10 points via
  `awardFanClubPoints`.

Because this only fires when `updatedSession && qualifies` was true for
*this specific tick*, a tick whose minute-claim is rejected (the existing
anti-double-tick protection — see `LiveSession.applyTick`'s own comment) also
never double-awards listening points: "same minute claim" is not a separate
mechanism built for fan clubs, it is the literal same one the host's own
hours already depend on. Two server instances racing the same tick cannot
double-award for the same reason two instances cannot double-count the
host's hours today — they're protected by the same `LiveSession` document's
atomic claim.

## Levels

20 levels, 5 tiers of 4 (bronze/silver/gold/platinum/legendary, replacing the
previous uneven 4/5/5/4/2 grouping):

```
Lv. 1– 4:        0 |    200 |    600 |   1,500
Lv. 5– 8:    3,000 |  6,000 | 10,000 |  16,000
Lv. 9–12:   25,000 | 40,000 | 60,000 |  90,000
Lv.13–16:  130,000 |180,000 |250,000 | 350,000
Lv.17–20:  500,000 |700,000 |1,000,000|1,500,000
```

Existing members keep their accumulated `points` as-is — the level badge is
computed live from `points` against whichever threshold table is deployed,
so a lower Lv.20 ceiling only means some members are now *closer to or at*
the cap, never that any points are lost or any member's level silently drops
versus what they could reach going forward.

## Inactivity

`inactive = (now - FanClubMembership.lastPointAt) > 7 days`. Computed on
read, returned as a boolean flag on every membership/member API response.
No points are ever removed for inactivity. Any point award of any kind
(including the `lastPointAt` bump itself) immediately reactivates the
membership on the very next read.

Perks gated behind `inactive === false` (whichever perks the client chooses
to gate — this PR only computes and returns the flag; perk UI is the
follow-up client PR) — the server adds no new perk logic beyond exposing the
flag.

## Weekly contributor & club leaderboard

**Weekly contributor** (`getSummary`'s `currentLeader`, and the weekly frame
job `fanClubWeeklyFrameJob.js`): top row in `FanClubWeekly` for `(owner,
weekStart)`, highest `points` first, tie-broken by member id for
determinism. Fetched with a small buffer (top N+10, matching the existing
`getTopSupportersExcludingLinked` pattern in `voiceRoomController.js`) and
then defensively re-filtered against `linkageService.groupLinkedAccounts` at
read time, in case a member became linked to the owner *after* earning
points earlier in the week — belt-and-suspenders on top of the write-time
exclusion in `awardFanClubPoints`. The weekly frame job moves from its own
Monday-UTC week + raw `GiftLog` aggregate to this exact query against last
week's `weekStart` (`getWeekBoundsForDate` applied to a moment inside last
week).

**Club leaderboard** (`getLeaderboard`): ranks club owners by `activeCount`
(active members right now) first, `FanClubWeekly` points summed across their
members this week second, as the tie-break. The old `period=daily|weekly`
toggle (which was really the third, rolling-7-day calendar) is removed —
there is one ranking, matching the one-calendar rule above. Computed by one
aggregation, cached in process memory for 10 minutes (the same in-memory
`Map`+TTL pattern already used for `voiceRoomController.js`'s
`contributorsCache` — no Redis dependency introduced, consistent with that
file's own stated reasoning for why not), recomputed lazily on first request
after the cache expires rather than on every request.

## Join

"نادي" membership ticket: 100 coins, through the exact same gift-ledger path
a real gift takes (`buildGiftWalletEntries` + `walletService.post`), inside
one Mongo transaction that also:

- Creates the `FanClubMembership` row (`points: 100`, `lastPointAt: now`).
- `$inc`s the owner's `fanClub.memberCount` and `fanClub.activeCount` by 1.
- Creates the `GiftLog` row for the ticket — *inside* this same transaction
  now (fixing finding #8), not after it.

Preconditions, checked before the transaction opens:

- `ownerId !== memberId` (no joining your own club).
- Owner is not a bot (`owner.isBot`).
- The joiner must already follow the owner (`Follow.exists({follower:
  memberId, followee: ownerId})`) — joining no longer skips this step.
- The joiner must not be linked to the owner (`linkageService.areLinked`) —
  an owner's own alt account can no longer buy a membership in their own
  club at all, not just fail to earn points from it afterward.
- Not already a member (idempotent 200 response, matching current
  behavior).

A duplicate/double-tap join (two concurrent requests for the same
(owner, member) pair) is still resolved by the existing unique index on
`{owner, member}`: the second transaction's `FanClubMembership.create`
throws `E11000` inside the transaction, the whole transaction (including the
coin debit) rolls back, and the second request gets the idempotent
"already a member" response with no coins spent — unchanged from today,
re-verified by a new concurrency test.

## Leave

New endpoint. Deletes the `FanClubMembership` row and every
`FanClubDailyProgress`/`FanClubWeekly` row for that (owner, member) pair, and
`$dec`rements the owner's `fanClub.memberCount` (always) and `activeCount`
(only if the membership was active at the moment of leaving, per its
`lastPointAt`) — all inside one transaction. Points are deleted, not
preserved: rejoining starts over at 100 (the join price), exactly like a
fresh membership. No refund of the original 100-coin ticket.

The client-side confirmation dialog is explicitly out of scope for this PR
(server only); the endpoint itself has no "are you sure" step — the caller
is expected to confirm before calling it.

## Club name profanity

`updateSettings`'s existing `name` validation (trim, 13-char max) gains one
more check: `containsProfanity(trimmed)` → reject with 400 if true, using
the same `server/utils/profanityFilter.js` already used for room chat and
room names elsewhere in this codebase.

## Realtime events

`fanclub-member-count-updated`, `fanclub-new-member`, and any other
fan-club-scoped event are no longer `io.emit(...)` (finding #5). Clients that
have a specific club's page open join a Socket.IO room `fanclub:<ownerId>`
(new `join-fanclub-room` / `leave-fanclub-room` socket events, mirroring the
existing `join-room-chat` / `leave-room-chat` pair exactly) and the server
emits to `io.to('fanclub:' + ownerId)` plus, where relevant, directly to the
owner's own socket (as `fanclub-new-member` already does today) — never to
every connected socket.

## Migration — `FANCLUB_V2_MIGRATION`

`off` (default) / `dry` / `apply`, following the exact
`resolveMigrationStartup` shape already established by
`followMigration.js`/`walletRedenominationMigration.js`: a `JobRun`-backed
one-time claim (job name `fanclub_v2_migration_v1`), non-blocking (does not
hold up `server.listen()` or `migrationGate`, because nothing it does is a
prerequisite for the new code paths to behave correctly — they compute
everything live where it matters).

What it does, and nothing else (explicitly: no backfill of historical
points, no rewriting of past `GiftLog` rows, no synthesizing
`FanClubWeekly`/`FanClubDailyProgress` history):

- For every distinct owner in `FanClubMembership`, recompute
  `fanClub.memberCount` (`countDocuments`) and `fanClub.activeCount` (count
  where `lastPointAt` is within the last 7 days) and `$set` them on the
  owner's `User` document via one `bulkWrite`.

This is safe to run repeatedly (idempotent — it always derives the same
answer from the current state of `FanClubMembership`), which is what makes
it "resumable" in the same sense the existing migrations use that word: a
`dry` preview reports the same counts an `apply` would write, and re-running
`apply` after a partial run (or just periodically, as a correction pass) is
always safe.

## Atomicity & security — "how I tried to break this" (design-level)

- **Join double-tap**: resolved by the unique `{owner, member}` index inside
  the transaction (new concurrency test: two concurrent joins, exactly one
  succeeds, coins charged exactly once).
- **Linked-account join**: `areLinked` checked before the transaction opens;
  rejected with 403 before any wallet write.
- **Linked-account points**: checked once, centrally, in
  `awardFanClubPoints`, so every current and future point source inherits
  the exclusion automatically instead of needing to remember it per call
  site.
- **Chat/check-in daily caps**: atomic `findOneAndUpdate` claims on
  `FanClubDailyProgress`, guarded by the boolean/threshold in the filter
  itself (`chatBonusAwarded: false`, `checkinAwarded: false`) — never
  read-then-write.
- **Listening cap**: atomic `findOneAndUpdate` with `listenMinutes: { $lt:
  30 } }` in the filter — the same pattern, and additionally piggybacks on
  the live-hours tick's own existing double-tick protection, so it cannot
  double-award even across two overlapping ticks.
- **Leave race (leave + a point award landing at the same moment)**: the
  leave transaction deletes the `FanClubMembership` row; any point award
  already in flight either completes against the still-existing row just
  before the delete (harmless — a few points on a membership about to be
  deleted anyway) or finds no row to `findOneAndUpdate` against (its
  `if (!membership) return` guard, unchanged from today) — never throws,
  never creates an orphaned row after the owner's counters have already been
  decremented.
