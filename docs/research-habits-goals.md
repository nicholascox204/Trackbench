# Research: goals, gamification, notifications and habit science (2026-11-22)

Purpose: decide which forms of participation Trackbench should offer, and which starting points (like presets) to give. Two rounds of web searches. **Read the confidence notes**: much of the app-side material is blog posts and company claims, and some well-known claims could not be confirmed.

## 1. What the evidence says

**Habit formation (reasonably solid).**
- Lally et al. (2010, UCL; 96 people, one daily behaviour, 84 days): reaching maximum automaticity took 66 days on average, but ranged from 18 to a projected 254. One missed day had little effect on later progress; many missed days, even spread out, lowered the level reached. Sources: [BPS digest](https://bps.org.uk/research-digest/how-form-habit), [UCL](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit), [Scientific American](https://www.scientificamerican.com/article/how-long-does-it-really-take-to-form-a-habit/). Caution: small study, one kind of behaviour, and the 66 days is an average, not a rule.
- A 2024 systematic review reports 55 to 66 days on average with wide variation, and that planning and monitoring helped consistency (Singh et al., *Healthcare*, found via search; not opened).
- If-then planning ("when X happens, I will do Y") is widely reported to raise follow-through, with a large meta-analysis cited. **Not confirmed**: I could not tie this to the Gollwitzer and Sheeran paper from the search results.

**Goal setting (solid in general, thin for apps).**
- Locke and Latham: specific, challenging goals beat vague or "do your best" goals ([2002 review](https://goal-lab.psych.umn.edu/orgpsych/2020/readings/5.%20Motivation/Locke%20&%20Latham%20(2002).pdf)).
- Process focus (the steps) tends to help more than outcome focus when the goal demands skill or self-control, though not all studies agree ([review](https://www.psychologicalscience.org/journals/current-directions/0963721414559774/)).
- Not found: approach versus avoidance goal evidence, and Fogg's Tiny Habits.

**Gamification (small, inconsistent benefit).**
- A 2025 meta-analysis of trials found slight improvement for gamified health apps ([PubMed](https://pubmed.ncbi.nlm.nih.gov/39764571/)); an earlier one found a small to moderate effect with high variation ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8669581)). For depression apps there was no clear advantage and gamification did not predict adherence ([JMIR](https://mhealth.jmir.org/2022/2/e27794/PDF)). Reviews warn that short studies may be inflated by novelty ([systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5376078/)).
- Which elements work is unclear. **No rigorous study isolating streaks was found.**
- Deci, Koestner and Ryan (1999, 128 studies): tangible, expected rewards undermined intrinsic motivation; verbal, informational feedback on high-interest tasks did not, and could help ([paper](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)). The finding is disputed by other authors and comes from lab and school settings, not apps, so it is a caution, not proof about points and badges.

**Streaks (mechanism plausible, evidence is anecdotal).**
- Streaks lean on loss aversion; the "what the hell" effect (one slip, then give up) is a long-standing idea from dieting research ([Smashing](https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/), [Mobbin](https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs)). Mostly blog-level sources.
- Duolingo's own posts: it separates the streak from the daily goal, offers streak freezes (up to two), and says higher daily goals made people less likely to be on a streak even when they used the app daily ([Duolingo](https://blog.duolingo.com/improving-the-streak)). Independent write-ups report people quitting after losing a long streak ([case study](https://jiwonvyoo.github.io/portfolio/case/duolingo/duo.html)); the churn figure there is unverified.
- Apple's Activity rings: a simple closed-or-not daily goal with frequent feedback; commentary calls it motivating and also habit-forming in an unhealthy way; the app later added a way to pause rings for rest ([UC](https://www.universityofcalifornia.edu/news/how-apple-watch-and-pervasive-computing-can-lure-you-leveling-your-fitness), [Macworld](https://www.macworld.com/article/3183369/ring-toss-why-the-apple-watch-activity-goals-need-an-update.html)). Opinion more than study.

**Notifications (best evidence is from health trials).**
- In a trial of the Drink Less app (350 users), a notification made opening the app in the next hour about 3.5 times more likely, but did not change how long people stayed engaged ([JMIR](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295)). Repeated fixed-schedule prompts risk habituation (people stop reacting), which is why adaptive, timed support is proposed. Irritating notifications get apps dropped. Evening looked like a good time in that trial. Vendor blog numbers were ignored.

**Social and commitment (observational).**
- StickK data: financial stakes did better than social ones alone, and the combination mattered most; observational, so not causal ([KAIST 2019](https://ic.kaist.ac.kr/files/papers/lee2019commitment.pdf), [2021](https://ic.kaist.ac.kr/files/papers/lee2021sticky.pdf)). Friend deposits in weight-loss contracts did better than none, retrospective and self-reported ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5316505)).
- Duolingo's Friend Streak needs no direct interaction, only both people showing up ([Duolingo](https://blog.duolingo.com/product-lessons-friend-streak/)).
- Not found: head-to-head evidence on competition versus cooperation in fitness apps.

**Not covered by the searches:** Strava kudos and clubs, Habitica parties and quests, Finch beyond a one-line description, Fogg's Tiny Habits, why people abandon self-tracking.

## 2. What this means for Trackbench

The evidence does not say one style works best. It points to a menu, a gentle default, and few hard penalties.

1. **Nothing is required (already decided).** Data view only is a legitimate way to use the app. The gamification evidence is too weak to impose it.
2. **Streaks need a choice of rule, not one rule.** Strict daily; a count per week or month ("3 of 7"); a grace allowance ("never miss twice", or N free passes); and a pause for illness or travel. This follows from missed days mattering little, the "what the hell" risk, and Duolingo and Apple both adding freezes and pauses. Always keep "best streak" beside "current".
3. **Goals default to process, not outcome.** "Run 3 times a week" before "lose 5 kg". Outcome goals (reach a reading) stay available because some people want them, and range goals suit readings like sleep. This matches the bounded options already specced.
4. **Keep rewards informational.** Feedback about progress and competence (a result line, a trend, "best week") fits the research better than points as payment. Points and levels stay optional and costless to miss, as already decided. Treat them as one style, not the system.
5. **Notifications are cue-based and fade.** Offer a time of day or an if-then cue ("after I wake"), not a fixed nagging schedule. Back off on its own: after several ignored reminders, offer to change or stop. Evening is a sensible suggested default for a first reminder. Keep it opt-in, as agreed.
6. **Social starts cooperative.** Friend-streak style (both show up) and a named accountability partner come before leaderboards. Leaderboards, if ever, are opt-in per group. Social stays on codes.
7. **Starting points named by what a person wants, not by feature:** e.g. *Just look at my data*, *Build a habit gently* (weekly count, grace, evening reminder, streak), *Hit a target* (process or reading goal with history preview), *Stay accountable* (partner, optional reminders). Each is a bundle of the same settings, editable later, so presets stay "the same bones".

## 3. Open questions for Nick

- Is "Build a habit gently" the right default bundle for people who say they want goals but don't know where to start?
- Pause and grace: one rule everywhere, or per goal?
- Do we want a "first 66 days" view (a habit-in-progress marker) or does it overpromise given the 18 to 254 range? Leaning no.

## 4. Gaps to close if this matters later

Strava and Habitica specifics; Fogg's model; self-tracking abandonment studies; the Gollwitzer meta-analysis. A third round of searches can cover them, and the primary papers should be read before any of this is quoted in public copy.

## 5. Competitor check and data-visualization ideas (added 2026-11-22)

**Competitors (store listings and vendor pages, not hands-on use).** Builders: [Nomie](https://alternativeto.net/software/nomie) (open source, local, track anything), [rTracker](https://apps.apple.com/us/app/id486541371) (iOS, custom trackers, CSV import), and newer ones seen only as listings: Trackr, Trackly, LifeTracker, Anything Tracker. Analysis: [Exist](https://exist.io/blog/custom-tracking/) correlates manual and connected data, including across consecutive days; its custom tags began yes/no only, later scaled values were added (sources date from 2017 to 2022); Bearable does health correlations. Simple: Daylio. Habit: Streaks (iOS only, 24-habit limit), Loop, Habitica. DIY: Notion and similar databases. Gyroscope returned nothing. **Finding:** no app found that pairs a friendly modular builder with one coherent Overview, goals across trackers and shareable design. Evidence is absence in a search, and the newer builders were not examined closely. Cross-tracker correlation already exists (Exist), so comparison is not our differentiator.

**Data-visualization sources to borrow from.** [Dear Data](https://www.huffingtonpost.com/2015/04/16/dear-data-art-project_n_7065004.html) (hand-drawn personal data); [DataSelfie](https://kgajos.seas.harvard.edu/papers/kim19dataselfie.pdf) (people designing their own visual vocabulary; fully automated collection can remove chances for reflection); the Feltron Annual Report (a year in review as a shareable object). Candidate Overview shapes, from these and general knowledge (calendar heatmap, small multiples, sparkline not covered by the searches): day grid, small multiples (one mini chart per tracker), sparklines, rings and bars for goals, a timeline of notable days, and a **year in review** card as the main share format.

**Reminders as their own purpose.** Digital reminders support prospective memory (remembering to do something later), usually by time or place ([Brewer et al. 2017](https://www.microsoft.com/en-us/research/publication/remember-remember-exploring-possibilities-digital-reminder-systems/)); linking a reminder to a distinctive cue already in a person's day ([Rogers et al.](https://toddrogers.scholars.harvard.edu/resource/rogersmilkmanrtapdf)) may beat a bare alarm. So a reminder can exist on its own ("read for a bit today") with no goal and no punishment or reward attached.
