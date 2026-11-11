# Nov 2 deleted slur post: audit and recovery plan

## What I checked (read-only)

- **Deletion behaviour:** Deleting a discussion post removes the row completely. There is no `deleted_at` or `deleted_by` field.
- **Post history table:** A history table (`discussion_post_audits`, with a trigger that records create, edit and delete) does exist. But it only started recording live on **Nov 3, 08:59 UTC**, about 20 hours after the incident.
  - All 349 history rows dated before that are backfilled copies of posts that still existed when history started. Their "acted by" field is empty.
  - For thread `81d89f5d…` (Class 456) there are 43 backfilled "created" rows and **no "deleted" rows on Nov 2**.
  - Searching the whole history table for the slur returns **0 matches**.
- **The live posts table:** The thread has 43 posts. None of them contains the slur.

## What is permanently lost

- The original text of the post
- Its exact posting time
- Who deleted it, and when

None of these exist in any app table. Database backups are not available to restore one row at a chosen past time.

## What may still exist (to check in build mode, read-only)

1. **Database request logs (backend API logs):** I will search for `DELETE` and `POST` requests on `/rest/v1/discussion_posts` on Nov 2, 12:00–16:00 UTC. If they still exist, each entry shows the user ID (`sub`) from the caller's sign-in token, the IP address, the user agent and the time. The post ID shows up in the delete filter, but the post's text is not in these logs. These logs are only kept for a short time, so they may already be gone. I will confirm either way.
2. **Postgres logs:** Only useful if an error or a slow query was recorded. Normal inserts and deletes are not logged. I expect nothing here.
3. **Sign-in logs:** These already give the George Chen session times (12:02:15 and 12:03:03 UTC, IP 114.92.1.91). I will re-check that these entries are still kept and export them.
4. **Login events table:** This is recorded on the server (added after the "invisible session" fix). I will cross-check it with item 3.
5. **Indirect evidence:** Reply threading. A reply to a deleted post would also have been removed, or would point to a parent that no longer exists. I will check `parent_id` values that point to missing posts. I will also check grade and score rows (`discussion_post_scores`) that still reference deleted post IDs.

## Output

- A single report file, admin-only, saved to Files (not inside the app). It will list:
  - each log hit, with user, name, time (UTC and Shanghai), IP and action
  - a clear "available vs lost" table
- Nothing is added to the app. No students or teachers can see anything. Discussion and privacy rules stay exactly as they are.

## Fastest path to an answer

The only source that could still name the person who deleted the post is item 1. I will run it first. If those logs have expired, the conclusion rests on the session evidence I already gave you, and I will say that plainly in the report.

## Optional follow-up (not now)

- Keep history rows when a post is deleted (already in place since Nov 3).
- Optionally switch to "soft delete" (hide the post instead of removing it), so moderators can review deleted content later.
