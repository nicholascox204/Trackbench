import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { ICON_CHOICES, K, searchIcons } from './icons';

const require = createRequire(import.meta.url);
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json') as Record<string, number>;

// Things people plausibly type. Every one must find at least one icon.
export const COMMON_QUERIES = `gym lift lifting weights run running jog walk steps hike bike cycling swim swimming yoga stretch pilates sport soccer football basketball tennis golf boxing climbing
water drink hydration coffee tea alcohol beer wine food meal meals eat diet protein calories vegetables fruit snack sugar junk dessert breakfast lunch dinner cook cooking groceries
sleep nap bed bedtime wake morning night meditate meditation mindfulness breathe breathing therapy mood gratitude journal diary stress anxiety happy sad
medication pills vitamins supplements medicine doctor injury rehab physio pain sick symptoms weight bodyweight bmi blood pressure heart rate
read reading book books study studying homework class exam language spanish learn learning course code coding programming write writing essay draft idea
art paint draw drawing photo photography music piano guitar sing instrument practice podcast game gaming video movie tv watch craft knitting sewing
time timer focus pomodoro deep work habit routine daily weekly streak goal target reminder schedule calendar plan todo tasks checklist
clean cleaning chores laundry dishes tidy declutter garden plants pet dog cat car drive commute travel flight trip budget money savings spend spending expenses bills invest income
friends family call text message date partner social party birthday gift volunteer donate
phone screen time scroll social media internet notifications quit smoking vape avoid habit bad
stats progress graph chart data numbers custom other misc everything general`.split(/\s+/).filter(Boolean);

test('every icon exists in the library and has search words', () => {
  for (const n of ICON_CHOICES) {
    assert.ok(glyphs[n] !== undefined, `${n} is not an Ionicons glyph`);
    assert.ok(K[n.replace(/-outline$/, '')], `${n} has no keywords`);
  }
});

test('common searches find something', () => {
  const misses = COMMON_QUERIES.filter((q) => searchIcons(q).length === 0);
  assert.deepEqual(misses, [], `no icon for: ${misses.join(', ')}`);
});

test('search forgives plurals and endings', () => {
  assert.ok(searchIcons('lifting').includes('barbell-outline'));
  assert.ok(searchIcons('weights').includes('barbell-outline'));
  assert.ok(searchIcons('gym lift').includes('barbell-outline'));
});
