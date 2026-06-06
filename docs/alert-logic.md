# Market Pulse — Alert Logic

Alerts are evaluated in `lib/alerts.js` (`evaluatePost`) right after a post is
classified, then persisted and dispatched (`raiseAlerts`). Each alert is deduped
per `(post_id, alert_type)` so re-analyzing a post never double-fires.

## Rules (§11)

| Alert type                    | Fires when…                                              | Severity |
|-------------------------------|----------------------------------------------------------|----------|
| `urgent_repair_post`          | urgency = emergency or category = emergency              | critical |
| `spring_repair_request`       | category = spring_repair                                 | high     |
| `opener_repair_request`       | category = opener_repair                                 | medium   |
| `target_city_post`            | post is in any tracked city                              | low      |
| `itg_mentioned`               | Inside Track is named in the thread                      | high     |
| `negative_competitor_mention` | a competitor is mentioned negatively (winnable customer) | medium   |
| `major_competitor_mentioned`  | a competitor tagged `tier = major` is recommended       | high     |
| `high_value_opportunity`      | AI says should_respond AND urgency is emergency/high     | high     |
| `unanswered_recommendation`   | open recommendation thread older than the configured threshold (default 15 min, from `scoring_config.unanswered_alert_minutes`) — surfaced by `v_unanswered_posts` and raised by a sweep | high |

The first eight are evaluated per post at analyze time. The unanswered-thread
alert is time-based: `v_unanswered_posts` exposes open recommendation threads
with `age_minutes`; a scheduled sweep (or the dashboard poll) raises it once a
post crosses the threshold with no competitor response and no approved ITG reply.

## Channels
Set `MARKET_PULSE_ALERT_CHANNELS` (e.g. `dashboard,email,slack`). Per channel:
- **dashboard** — always; the alert row itself (shown in the AlertsDrawer).
- **email** — via Resend to `ALERT_EMAIL_TO`; no-op if unconfigured.
- **slack** — via `SLACK_WEBHOOK_URL`; no-op if unconfigured.
- **sms** — stub; wire a provider (e.g. Twilio) before enabling.

After a row is created, enabled channels are dispatched; the row's `status` moves
`new → sent`. Members (admin/marketing_manager/reviewer) can acknowledge, moving
it to `acknowledged`. `read_only_partner` can view but not ack.

## Severity → urgency of action
critical = drop what you're doing (emergency in a target city); high = respond
this hour; medium = respond today; low = awareness. The dashboard sorts the
AlertsDrawer by severity then recency.
