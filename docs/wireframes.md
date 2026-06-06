# Market Pulse — Screen Wireframes

Five screens behind one shell (TopBar + NavTabs + AlertsDrawer). Screen A is
fully built in `frontend/executive-market-dashboard.html`; B–E are wireframed
here and structured in `frontend-component-structure.md`.

## A. Executive Market Dashboard  (BUILT)
```
┌─ Market Pulse · Executive ───────────────── period ▾  [🔔] ─┐
│ [Mention vol] [ITG share] [Opportunities] [Avg reply time]  │  KPI strip
├──────────────────────────────┬──────────────────────────────┤
│ Top Competitors by Popularity│ This Week                     │
│  # company  tier  ment score │   competitor mentions    34   │
│  1 A-1      MAJ   18  ▇▇▇ 86 │   ITG mentions            3   │
│  2 Precision MAJ  12  ▇▇  61 │   open opportunities      9   │
│  3 Mem Pros MIN    5  ▇   22 │   missed (aged out)       4   │
│                              ├──────────────────────────────┤
│                              │ Strongest by City             │
│                              │   A-1 leads Olive Branch  6   │
├──────────────────────────────┼──────────────────────────────┤
│ Response Opportunities       │ Speed Scoreboard              │
│  ● Emergency spring · OB 2h  │   A-1            ▇      30m    │
│  ● Neg Precision · Southaven │   Mem Pros       ▇▇     75m    │
│                              │   Precision      ▇▇▇▇  240m    │
│                              │   ITG (target)   ▇      15m    │
└──────────────────────────────┴──────────────────────────────┘
```

## B. Competitor Ranking Dashboard
```
Filters: [month ▾][tier ▾][city ▾]                    [Weights ⚙ admin]
┌ rank│company│ment│pos│uniq│avg resp│G-rating│reviews│velocity│score│threat ┐
│  1  │A-1    │ 18 │14 │ 11 │  30m   │  4.8   │  310  │  +12   │ 86  │ HIGH  │
│  2  │Precis │ 12 │ 4 │  8 │ 240m   │  4.6   │  820  │  +25   │ 61  │ HIGH  │
│  3  │Mem Pro│  5 │ 1 │  4 │  75m   │  4.2   │  140  │   +2   │ 22  │ MED   │
└──────────────────────────────────────────────────────────────────────────┘
 row → CompetitorDrawer (profile · aliases · mention history · response samples)
 Weights ⚙ → 8 sliders (sum=100%) → [Recompute]
```

## C. Post Feed
```
Filters: [city][platform][urgency][category][should-respond][search]  [+ Capture]
┌────────────────────────────────────────────────────────────────────────────┐
│ ⚠ HIGH · FB Group · Olive Branch · spring_repair · 2h ago      conf 0.92    │
│ "Spring snapped, door won't open, who do y'all recommend?"                  │
│ mentions: [A-1 ✓pos] [Precision ·neu]      ITG SHOULD RESPOND               │
│ [Analyze] [Suggest replies]                                       ▸ expand   │
├────────────────────────────────────────────────────────────────────────────┤
│ PostDrawer ▾                                                                │
│   Raw text · screenshot/source link                                        │
│   Mentions:  competitor | sentiment | who | unprompted                      │
│   Competitor responses: type | tone | resp time | effectiveness             │
│   Suggested responses → ApprovalPanel                                       │
│     [body editable]  conf 0.90  [Approve][Edit+Approve][Reject][Copy]        │
│                                  [Mark responded][Assign ▾][deadline]        │
└────────────────────────────────────────────────────────────────────────────┘
```

## D. City / Market View
```
┌ Olive Branch ─────┐ ┌ Southaven ───────┐ ┌ Hernando ────────┐
│ leader: A-1       │ │ leader: A-1      │ │ leader: Precision│
│ mentions: 6       │ │ mentions: 4      │ │ mentions: 3      │
│ ITG present: ✗    │ │ ITG present: ✓   │ │ ITG present: ✗   │
└───────────────────┘ └──────────────────┘ └──────────────────┘
Underserved (demand, no ITG mentions):  Hernando · Nesbit · Arlington
Emergency-demand heat:  Olive Branch ▇▇▇ · Southaven ▇▇ · Memphis ▇
 card → CityDrawer (full per-city competitor ranking)
```

## E. Response Quality Dashboard
```
Best responses (high effectiveness)        Weak responses (pushy/generic/spammy)
  A-1 · ask_to_call · 30m · 82               Precision · direct_pitch · 240m · 55
Tone breakdown:  professional ▇▇▇ · generic ▇▇ · pushy ▇
Avg response time by company:  A-1 30m · Mem Pros 75m · Precision 240m
ITG improvement notes (from AI analysis):  "lead with same-day + local; …"
```

## Shell elements
```
TopBar:   ◧ Market Pulse | period ▾ | role badge | 🔔 (alert count)
NavTabs:  Executive · Ranking · Post Feed · City/Market · Response Quality
AlertsDrawer: severity-sorted rows · [Acknowledge] · filter by severity
```
