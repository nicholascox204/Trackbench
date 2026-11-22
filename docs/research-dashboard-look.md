# Dashboard look: research and candidate directions (2026-11-22)

Light on purpose, to keep ideas open. Sources are design write-ups and company posts, not usability studies; Tufte's small multiples and mobile-specific guidance did not come up in the searches.

## What the sources agree on
- A dashboard is read at a glance, on one screen; a bare number needs a reference (a target, the last period) ([Few, via review](https://uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php), [principles](https://ljkelly3141.github.io/bi-book/15.4-dashboard-design-principles.html)).
- Position and length read fastest; sparklines give a number its trend; bullet graphs replace gauges; strip non-data ink (borders, fills, grid lines) or mute it. Red and green fail for colour-blind people.
- Progressive disclosure: glanceable scores, then trends, then deep detail ([WHOOP breakdown](https://www.925studios.co/blog/whoop-design-breakdown)); Oura is calm and front-loads the important numbers ([Oura redesign](https://instrument.com/work/oura-app)); Apple's rings motivate, though Apple Health itself draws criticism for its UX.
- Shareable data stories use big type, bold colour (partly drawn from the person's own data), vertical cards, and a near-black canvas ([Spotify Wrapped case study](https://medium.com/active-theory/spotify-wrapped-2018-technical-case-study-5b7cfb7e9d3a), [Spotify newsroom](https://newsroom.spotify.com/?p=32167)).
- Material: the chart type follows the data and the message, and must not distort it ([Material](https://material.io/design/communication/data-visualization.html)). Apple: use colour judiciously, support VoiceOver on charts ([HIG](https://developer.apple.com/design/human-interface-guidelines/charts.md)).

## Three candidate looks (same data, mocked in chat)
- **A. Calm:** soft cards, one big number, sparing colour. Friendly, spends space.
- **B. Ink:** hairlines, square day grid, sparklines, bullet bars. Densest; plain on its own.
- **C. Poster:** near-black, huge type, one vivid colour. Best as a share card, tiring as a daily screen.

**Leaning (not decided):** the daily Overview is Ink structure with Calm warmth (one headline number, soft streak colour); the share card is Poster, fixed layout, in the person's own theme colour.

## How our data feeds the shapes
Counts per day: dot or square grid. Readings: sparkline in the daily view, full line on tap. Goals: bullet bar with "met 4 of the last 6". Streak: one big number. Many trackers: ranked list plus one sparkline per tracker (small multiples). Accessibility: never colour alone; dark mode is a first-class case.
