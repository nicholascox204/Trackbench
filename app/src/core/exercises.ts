// A starting library of common exercises, so adding one is a tap on a suggestion instead of typing (and names stay consistent,
// which keeps an exercise's history and records together). Names you have used before come first.

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Full body', 'Cardio'] as const;
export type Muscle = (typeof MUSCLES)[number];

const L = (muscle: Muscle, names: string): [string, Muscle][] => names.split(', ').map((n) => [n, muscle]);

export const EXERCISES: [string, Muscle][] = [
  ...L('Chest', 'Bench Press, Incline Bench Press, Decline Bench Press, Dumbbell Bench Press, Incline Dumbbell Press, Dumbbell Fly, Cable Fly, Chest Dip, Push-Up, Machine Chest Press, Pec Deck'),
  ...L('Back', 'Deadlift, Pull-Up, Chin-Up, Lat Pulldown, Barbell Row, Dumbbell Row, Seated Cable Row, T-Bar Row, Pendlay Row, Face Pull, Straight-Arm Pulldown, Back Extension, Rack Pull, Shrug'),
  ...L('Shoulders', 'Overhead Press, Dumbbell Shoulder Press, Arnold Press, Lateral Raise, Cable Lateral Raise, Front Raise, Rear Delt Fly, Upright Row, Machine Shoulder Press'),
  ...L('Arms', 'Barbell Curl, Dumbbell Curl, Hammer Curl, Preacher Curl, Cable Curl, Incline Dumbbell Curl, Triceps Pushdown, Overhead Triceps Extension, Skull Crusher, Close-Grip Bench Press, Triceps Dip, Wrist Curl'),
  ...L('Legs', 'Squat, Front Squat, Goblet Squat, Leg Press, Hack Squat, Bulgarian Split Squat, Lunge, Walking Lunge, Leg Extension, Leg Curl, Seated Leg Curl, Romanian Deadlift, Stiff-Leg Deadlift, Standing Calf Raise, Seated Calf Raise, Step-Up'),
  ...L('Glutes', 'Hip Thrust, Glute Bridge, Cable Kickback, Hip Abduction, Sumo Deadlift, Good Morning'),
  ...L('Core', 'Plank, Side Plank, Crunch, Hanging Leg Raise, Cable Crunch, Ab Wheel Rollout, Russian Twist, Dead Bug, Pallof Press, Sit-Up'),
  ...L('Full body', 'Clean, Power Clean, Snatch, Clean and Jerk, Thruster, Kettlebell Swing, Farmer\'s Carry, Burpee, Turkish Get-Up'),
  ...L('Cardio', 'Rowing, Cycling, Treadmill, Elliptical, Stair Climber, Jump Rope, Sled Push, Battle Ropes'),
];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

// Up to `max` names for what has been typed: your own names first, then the library; a match at the start of any word ranks
// above one in the middle. Nothing is suggested for an empty box or for an exact name already typed.
export function suggestExercises(query: string, own: string[] = [], max = 6): { name: string; muscle?: Muscle }[] {
  const q = norm(query);
  if (!q) return [];
  const score = (name: string): number => {
    const n = norm(name);
    if (n === q) return -1;
    if (n.startsWith(q)) return 3;
    if (n.split(' ').some((w) => w.startsWith(q))) return 2;
    return q.split(' ').every((part) => n.includes(part)) ? 1 : 0;
  };
  const seen = new Set<string>();
  const out: { name: string; muscle?: Muscle; s: number; mine: boolean }[] = [];
  for (const name of own) { const k = norm(name); if (seen.has(k)) continue; seen.add(k); out.push({ name, s: score(name), mine: true }); }
  for (const [name, muscle] of EXERCISES) { const k = norm(name); if (seen.has(k)) continue; seen.add(k); out.push({ name, muscle, s: score(name), mine: false }); }
  if (out.some((x) => x.s === -1)) return [];
  return out.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || Number(b.mine) - Number(a.mine) || a.name.length - b.name.length).slice(0, max).map(({ name, muscle }) => ({ name, ...(muscle ? { muscle } : {}) }));
}
