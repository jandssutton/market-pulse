# Market Pulse — Popularity Scoring

Each competitor gets a **0–100 popularity score** per month. The score is
*relative* to the live competitor set: a competitor's raw stats are min-max
normalized across the field, then combined with adjustable weights. Heavy
aggregation happens in SQL views; the cross-competitor normalization + weighting
happens in `lib/scoring.js` (so the math is identical regardless of how weights
are tuned).

## Components and default weights (§18)

| Component        | Weight | Raw input (per competitor, per month)                       |
|------------------|:------:|--------------------------------------------------------------|
| Mention volume   |  25%   | total mentions                                               |
| Unique recommenders | 20% | distinct people who recommended them                         |
| Positive sentiment | 15%  | count of positive mentions                                   |
| Response speed   |  10%   | avg first-response minutes (inverted — faster is better)     |
| Google strength  |  10%   | blend of rating (0–5) and log10(review count)                |
| Review velocity  |  10%   | new Google reviews in the last 30 days                       |
| City coverage    |   5%   | distinct cities/markets they appear in                       |
| Recency          |   5%   | how recently they were last mentioned (decays over 30 days)  |

Weights live in `scoring_config` and are admin-adjustable; a CHECK constraint
enforces that they sum to 1.00.

## Normalization
For each component, across the competitor set for the month:
```
normalized = (value − min) / (max − min)        # 0..1; flat field → 0
```
- **Response speed** is inverted: `1 − normalized`, because fewer minutes is
  better. Competitors with no recorded response score 0 on this component.
- **Google strength** = `0.6 × (rating/5) + 0.4 × min(1, log10(reviews+1)/3)`
  (so ~1000 reviews approaches the cap), then min-max normalized.
- **Recency** = `max(0, 1 − ageDays/30)` on the last-seen date.

## Final score
```
score = 100 × Σ (weight_i × normalized_i)
```
Rounded to two decimals. Competitors are then ranked; **rank 1 = biggest threat**.

## Worked example (seed data, this month)
Three ranked competitors. Normalized components (from the seed):

| Competitor        | mention | unique | positive | speed | google | velocity | city | recency |
|-------------------|:------:|:------:|:-------:|:----:|:------:|:-------:|:----:|:------:|
| A-1 Overhead      | 1.00  | 1.00   | 1.00    | 1.00 | 0.74   | 0.50    | 1.00 | 0.95   |
| Precision         | 0.66  | 0.50   | 0.00    | 0.00 | 1.00   | 1.00    | 1.00 | 0.90   |
| Memphis Door Pros | 0.33  | 0.50   | 0.00    | 0.00 | 0.45   | 0.50    | 0.50 | 0.60   |

A-1 with default weights:
```
100 × (.25·1.00 + .20·1.00 + .15·1.00 + .10·1.00 + .10·.74 + .10·.50 + .05·1.00 + .05·.95)
= 100 × (.25+.20+.15+.10+.074+.05+.05+.0475) ≈ 86.4
```
Precision ≈ 61.2, Memphis Door Pros ≈ 22.1 → ranks 1, 2, 3.

A-1 outranks Precision despite Precision's far larger Google footprint, because
mentions, unique recommenders, positive sentiment, and response speed (the
conversation signals) carry 70% of the weight. That is the intended behavior:
Market Pulse measures who homeowners actually recommend and how rivals show up in
threads, not just who has the biggest ad budget.

## Named rankings (derived from the same set)
Most mentioned, fastest response, best reviewed, strongest Google, biggest threat
(top overall) are computed from the component vectors in `/api/scores` without a
second pass. City rankings come from `city_rankings` (mentions, score tiebreak).

## Tuning
Adjust the eight weights in `scoring_config` (Ranking Dashboard → Weight Panel,
admin only), then POST `/api/scores/recompute`. The weight snapshot is stored in
each `market_scores.components` row so any score is reproducible.
