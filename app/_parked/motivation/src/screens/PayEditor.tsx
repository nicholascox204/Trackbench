// What a goal does in the game, as two compact rows: what you get when it is met, and what it costs when missed.
// "Game default" leaves a part unset so the game's blanket setting applies. Used by the goal builders and the game's own default.

import { payText } from '../core/motivation';
import type { Payout, SystemConfig } from '../core/types';
import { Dropdown } from '../ui/Dropdown';
import { Muted } from '../ui/kit';

const REWARDS = [5, 10, 20, 50, 100];
const FINES = [5, 10, 25];

const missKey = (p: Payout): string => {
  if (p.penalty === undefined && p.heart === undefined) return 'default';
  if (!p.penalty && !p.heart) return 'none';
  return `${p.heart ? 'h' : ''}${p.penalty ? `p${p.penalty}` : ''}`;
};

export function PayEditor({ pay, config, onChange, isDefault }: { pay: Payout | undefined; config: SystemConfig; onChange: (p: Payout | undefined) => void; isDefault?: boolean }) {
  const p = pay ?? {};
  const set = (next: Payout) => {
    const clean: Payout = {};
    if (next.reward !== undefined) clean.reward = next.reward;
    if (next.penalty !== undefined) clean.penalty = next.penalty;
    if (next.heart !== undefined) clean.heart = next.heart;
    onChange(Object.keys(clean).length ? clean : undefined);
  };
  const defaultWord = isDefault ? 'By goal length' : 'Default';
  const rewardOptions = [
    { key: 'default', label: defaultWord, sub: isDefault ? 'A weekly goal is worth more than a daily one' : undefined },
    ...REWARDS.map((n) => ({ key: String(n), label: `+${n} points` })),
  ];
  const missOptions: { key: string; label: string }[] = [
    { key: 'default', label: isDefault ? 'Nothing' : 'Default' },
    ...(isDefault ? [] : [{ key: 'none', label: 'Nothing' }]),
    ...(config.points.on ? FINES.map((n) => ({ key: `p${n}`, label: `Lose ${n} points` })) : []),
    ...(config.hearts.on ? [{ key: 'h', label: 'Lose a heart' }, ...(config.points.on ? [{ key: 'hp10', label: 'Lose a heart and 10 points' }] : [])] : []),
  ];
  const rewardValue = p.reward === undefined ? defaultWord : `+${p.reward} points`;
  const mk = missKey(p);
  const missValue = missOptions.find((o) => o.key === mk)?.label ?? (mk === 'default' ? 'Default' : 'Custom');
  return (
    <>
      {config.points.on ? (
        <Dropdown
          compact label="When met" value={rewardValue} selected={p.reward === undefined ? 'default' : String(p.reward)}
          options={rewardOptions} onSelect={(k) => set({ ...p, reward: k === 'default' ? undefined : Number(k) })}
        />
      ) : null}
      <Dropdown
        compact label="If missed" value={missValue} selected={mk}
        options={missOptions}
        onSelect={(k) => {
          if (k === 'default') set({ ...p, penalty: undefined, heart: undefined });
          else if (k === 'none') set({ ...p, penalty: 0, heart: false });
          else set({ ...p, penalty: /p(\d+)/.test(k) ? Number(/p(\d+)/.exec(k)![1]) : 0, heart: k.startsWith('h') });
        }}
      />
      <Muted style={{ marginTop: -2 }}>{payText(pay, config)}</Muted>
    </>
  );
}
