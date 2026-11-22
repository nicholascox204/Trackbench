// Core data model (v3): one universal tracker with a toolbox.
// A tracker is configured, not typed: it has entry fields, optionally a weekly
// plan of slots, targets, rolling averages and a success rule. The system layer
// reads each tracker only through its measures.
// Values with a unit kind are stored in base units (kg, km, cm, ml).

export type UnitKind = 'weight' | 'distance' | 'length' | 'volume';
export type UnitSystem = 'imperial' | 'metric';

export type ThemeName =
  | 'auto' | 'midnight' | 'oled' | 'forest' | 'ocean' | 'plum' | 'ember' | 'paper' | 'snow';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Corners = 'sharp' | 'soft' | 'round';
export type HomeLayout = 'rows' | 'cards';

// How the app looks. Picked in Settings; the theme layer reads this live.
export interface Appearance {
  theme: ThemeName;
  accent: number; // index into the accent list
  background?: 'light' | 'dark' | 'tint' | 'opposite'; // light or dark, or a deep shade that follows the highlight. Unset: follow the phone's light or dark.
  bg?: string; // a background colour of your own (#rrggbb); the other surface colours are worked out from it. Overrides `theme`.
  accentHex?: string; // a highlight colour of your own (#rrggbb). Overrides `accent`.
  density: Density;
  corners: Corners;
  layout: HomeLayout;
  icons: boolean; // show tracker icons
}

export const defaultAppearance: Appearance = {
  theme: 'auto', accent: 0, density: 'comfortable', corners: 'soft', layout: 'rows', icons: true,
};

export interface Settings {
  units: UnitSystem; // default for every unit field; a field can override it
  weekStart?: 'mon' | 'sun'; // where calendar weeks begin (default Monday)
  appearance?: Appearance;
  name?: string; // what to call the person; also the display name once there are accounts
  welcomed?: boolean; // the opening screen (name and look) has been done
  alerts?: AlertSettings; // what the app may nudge you about (set up; delivery comes later)
  handle?: string; // the username, once chosen (the cloud holds the same one)
  skippedSignIn?: boolean; // testing only: use the app without an account
  cloudSync?: boolean; // back up to the cloud and keep other devices in step (off until chosen)
  devSync?: boolean; // testing: trackers made from a template are rebuilt from it each time the app opens
  openOn?: { mode: 'smart' } | { mode: 'last' } | { mode: 'pinned'; id: string }; // which tracker the app opens on; unset means smart
  lastTracker?: { id: string; at: number }; // the tracker you were last on, and when
}

// Notifications, by kind. Each kind is opt in; a tracker can be left out of all of them.
export type AlertKind = 'reminders' | 'warnings' | 'cheers';
export interface AlertSettings {
  on: Record<AlertKind, boolean>;
  quiet?: { from: string; to: string }; // HH:MM, no alerts between these times
  mute?: string[]; // tracker ids that never alert
}

export type FieldType = 'number' | 'text' | 'rating' | 'choice' | 'time' | 'duration'; // duration: whole minutes, entered and shown as hours and minutes

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  unitKind?: UnitKind; // converts with the unit setting; stored in base units
  unitOverride?: string; // e.g. 'kg' to ignore the system default for this field
  unit?: string; // fixed label that never converts: kcal, g, min
  step?: number; // stepper increment, in display units
  default?: number | string; // number defaults are in base units for unit fields
  label?: boolean; // a text field that names the entry (what it was), with suggestions from past entries
  reading?: boolean; // a number that is a reading (like a weight): a day shows its latest value, not a sum
  max?: number; // rating: the top of the scale (default 5)
  options?: string[]; // choice: the list to pick from
  optional?: boolean; // text: shown as a small + until you want it, so the form stays short
  multi?: boolean; // choice: more than one may be picked; stored as the picks joined by | (see core/choices.ts)
}

export type MeasureCalc =
  | { op: 'done' } // 1 if anything is done today
  | { op: 'count' } // number of done entries
  | { op: 'sum'; field: string }
  | { op: 'max'; field: string }
  | { op: 'latest'; field: string }
  | { op: 'sumProduct'; a: string; b: string } // e.g. weight x reps = volume
  | { op: 'sumExpr'; a: string; b: string; fn: 'add' | 'sub' | 'span' } // per entry a + b, a - b, or the hours from time a to time b, added up over the day
  | { op: 'ratio'; a: string; b: string } // the day's total of a divided by the day's total of b, like minutes per mile
  | { op: 'completion' }; // percent of today's plan done

export interface Measure {
  id: string;
  name: string;
  calc: MeasureCalc;
  unit?: string; // fixed label
  unitFrom?: string; // field id whose unit this measure follows
}

// Daily target on a measure. min = at least, max = at most.
export interface Target {
  id: string;
  measure: string;
  min?: number; // base units for unit measures
  max?: number;
}

export interface Derived {
  id: string;
  name: string;
  measure: string;
  days: number; // rolling average over this many days that have data
}

export type SuccessRule =
  | { mode: 'logged' }
  | { mode: 'plan'; minPct: number }
  | { mode: 'target'; targetId: string }
  | { mode: 'clean' } // a good day is one with nothing logged (avoiding something)
  | { mode: 'targets'; targetIds: string[]; planMinPct?: number }; // every one of these goals met (and the plan, if planMinPct is set)

// ---- Plan ----

export interface SlotVariant {
  label: string;
  values: Record<string, number>;
}

export interface Slot {
  id: string;
  name: string;
  group?: string; // e.g. a meal time
  sets?: number; // > 0 makes a row slot with this many rows; otherwise an item slot
  range?: string; // target text such as 6-8 or 30-60s
  values?: Record<string, number>; // item slots: numbers this item carries
  variants?: SlotVariant[]; // item slots: alternatives with their own numbers
}

export interface PlanDay {
  label: string;
  slots: Slot[];
}

export interface PlanVersion {
  from: string; // YYYY-MM-DD effective date
  days: PlanDay[]; // index 0..6 = Sunday..Saturday
  same?: boolean; // every training day shares one list; editing one day edits them all
  rotation?: boolean; // the lists are taken in turn (Push, Pull, Legs), not tied to weekdays: days is just the lists, in order
}

// ---- Goals ----

// What a goal does in the game. Every part is optional; anything unset uses the game's defaults (SystemConfig.defaultPay).
export interface Payout {
  reward?: number; // points gained when it is met
  penalty?: number; // points lost when it is missed
  heart?: boolean; // lose a heart when it is missed
}

// How a goal counts: a repeating calendar week or month, or a running total, best day or latest reading.
export type GoalHow = 'day' | 'week' | 'month' | 'total' | 'best' | 'latest';

// How a goal combines what you record: add it up, the highest, the lowest, the average, the latest value,
// the number of entries, or the number of days you logged anything.
export type GoalAgg = 'sum' | 'max' | 'min' | 'avg' | 'latest' | 'count' | 'days';

// A quest on a tracker with visible progress. It counts one of the things you record (field) combined by
// agg, over a window (how). Goals saved earlier used a measure instead of a field and still work.
// Numbers are in base units.
export interface GoalDef {
  id: string;
  pay?: Payout; // what meeting or missing it does in the game; unset uses the game's defaults
  measure: string; // the field id, 'count' or 'days' (older goals: a measure id)
  where?: { field: string; equals: string }; // count only entries where a choice field has this option
  item?: string; // a planned tracker: count only this item's entries (like "Bench press"), matched by name
  field?: string; // the thing you record that this counts
  agg?: GoalAgg; // how it is combined
  how: GoalHow;
  cmp: 'min' | 'max' | 'range' | 'reach';
  value: number;
  value2?: number; // range: the upper end
  start?: number; // reach: where you began
  from: string; // YYYY-MM-DD the goal begins counting
  until?: string; // YYYY-MM-DD optional deadline
}

// ---- Tracker ----

export type InputKind = 'check' | 'tap' | 'form' | 'plan';

// What a planned tracker calls things. Defaults are Exercise, Set and Range; any tracker can reword them.
export interface Terms {
  item?: string;
  row?: string;
  target?: string;
}

// When a tracker is expected. See core/schedule.ts. "times" and "whenever" have no particular due day.
export type Schedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday .. 6 = Saturday
  | { kind: 'interval'; n: number; from: string } // every n days, counted from a date (YYYY-MM-DD)
  | { kind: 'times'; n: number; per: 'week' | 'month' } // n times a week or month, on any days
  | { kind: 'monthly'; day: number | 'last' } // a date of the month, or its last day
  | { kind: 'blocks'; n: number } // n days in a row, done whenever you start: logging a day opens a block and the next days are expected
  | { kind: 'whenever' };

// An optional span a tracker is only active for ("just for a while"). Either end may be left open.
export interface ScheduleWindow {
  from?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
}

export interface Tracker {
  id: string;
  name: string;
  icon: string; // an Ionicons name; see icons.ts
  presetId: string;
  templateId?: string; // the template it was made from, so a changed template can be applied to it while testing
  input: InputKind;
  fields: Field[];
  measures: Measure[];
  primaryMeasure: string;
  targets: Target[];
  derived: Derived[];
  success: SuccessRule;
  plan: PlanVersion[];
  schedule?: Schedule; // when it is expected; unset means derived from the plan, else every day
  window?: ScheduleWindow; // only active between these dates
  tools: { previous: boolean; lockPast: boolean; countdown?: boolean; timer?: boolean; timerInto?: string; countdownInto?: string }; // countdown: set a time and count down; timer: count up. Both sit on the page
  terms?: Terms;
  planStyle?: 'sets' | 'items'; // planned trackers: each item is filled in each time (like sets), or ticked with its own numbers (like a meal)
  goals?: GoalDef[]; // quests added on the tracker page
  avoid?: boolean; // a check-in where you log slips, not successes
  streak?: boolean; // an avoid tracker shows its clean streak unless this is false
  sources?: Record<string, 'sensor' | 'health' | 'manual'>; // where a number comes from, by field id: the phone's own counter, Health Connect, or entered by hand
  rotationPick?: { day: number; index: number }; // a rotation: the list chosen for this day before anything was logged
  daily?: boolean; // one reading a day; saving again replaces it
  systemId: string | null;
  createdAt: number;
  /** An avoid tracker: the day the streak counts from, when set by hand (someone who quit before they started tracking). */
  cleanFrom?: number;
  /** The day that count was typed. Slips from before it are replaced by it; slips from then on count. */
  cleanSetOn?: number;
}

export type TrackerDraft = Omit<Tracker, 'id' | 'systemId' | 'createdAt'>;

export interface Entry {
  id: string;
  trackerId: string;
  at: number;
  slotId?: string;
  row?: number; // row slots: which set
  variant?: number; // item slots: chosen variant
  done: boolean;
  values: Record<string, number | string>;
  auto?: string[]; // set rows: the numbers the done tick filled in (from last time, the set above, or the default); unticking takes them back
}

// ---- System ----

export type Consistency = 'none' | 'strict' | 'grace' | 'score';
export type Intensity = 'gentle' | 'standard' | 'hardcore';

export interface CustomRule {
  id: string;
  trackerId: string;
  measure: string;
  cmp: '>=' | '<=';
  value: number; // base units for unit measures
  points: number;
}

export interface SystemConfig {
  intensity: Intensity;
  consistency: Consistency;
  points: { on: boolean; reward: number; penalty: number };
  hearts: { on: boolean; max: number; loseOn?: 'any' | 'half' | 'all'; regain?: boolean }; // loseOn: a day costs a heart when any, half or all of the trackers due are missed
  levels: { on: boolean; perLevel?: number }; // lifetime points per level step; unset is 25, bigger is slower
  week?: { on: boolean; minPct: number }; // a week is good when at least this share of a tracker's due days were good
  defaultPay?: Payout; // used by every goal that sets none of its own
  alerts?: AlertSettings; // what the app may nudge you about; part of the style you pick
  lucky: { on: boolean; chance: number; bonus: number };
  allClear: { on: boolean; bonus: number };
  rules: CustomRule[];
}

// A goal that belongs to the system, not to one tracker: it counts across the trackers chosen (or all of them).
export type QuestMetric = 'trackersDone' | 'perfectDays' | 'entries';
export interface Quest {
  id: string;
  trackers: string[] | 'all'; // tracker ids, or every tracker
  metric: QuestMetric;
  how: 'day' | 'week' | 'month' | 'total'; // today, this week, this month, or since it began
  value: number; // at least this many
  pay?: Payout;
  from: string; // YYYY-MM-DD it began
  until?: string; // YYYY-MM-DD optional date to reach it by (a "total" quest)
}

export interface System {
  id: string; // a game: the rules for the trackers that are in it
  name: string;
  config: SystemConfig;
  quests?: Quest[];
  createdAt: number;
}

// A deleted tracker kept for a while so it can be restored: the tracker, its entries, and the system rules that pointed at it.
export interface DeletedTracker {
  id: string;
  at: number; // when it was deleted
  tracker: Tracker;
  entries: Entry[];
  rules: { systemId: string; rule: CustomRule }[];
}

export interface AppState {
  trackers: Tracker[];
  entries: Entry[];
  systems: System[];
  settings: Settings;
  onboarded: boolean;
  trash?: DeletedTracker[]; // the last few deleted trackers, newest first
}

export const emptyState: AppState = {
  trackers: [],
  entries: [],
  systems: [],
  settings: { units: 'imperial', appearance: defaultAppearance },
  onboarded: false,
};
