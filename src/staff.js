import { STANDARD } from './finance.js';

// Backroom staff as levels 1-5 in three areas, for every club: c.staff = { coaching, scouting, medical }.
// Level 3 changes nothing (the game was calibrated without staff); each step up or down moves:
//   coaching: training growth (and the youth intake: src/youth.js)
//   scouting: how many scouts the human club has and how fast they report (src/scouting.js)
//   medical:  how long injuries last
// AI clubs get their division's standard level (STANDARD in finance.js), one higher or lower when
// their squad quality is a point or more above or below the division's median. The human club picks
// its own levels and pays for them: see staffBill() in finance.js.
export const AREAS = ['coaching', 'scouting', 'medical'];
export const COACHING = [0.7, 0.85, 1, 1.15, 1.3];     // × growth chance, by level 1-5
export const MEDICAL = [1.25, 1.1, 1, 0.9, 0.8];       // × injury length
export const SCOUTS = [1, 2, 2, 3, 3];                 // the human club's scouts
export const SCOUT_SPEED = [1.4, 1.2, 1, 0.85, 0.7];   // × days to report

const at = (list, level) => list[Math.max(1, Math.min(5, level)) - 1];
export const coachScale = c => at(COACHING, c.staff?.coaching ?? 3);
export const medicalScale = c => at(MEDICAL, c.staff?.medical ?? 3);
export const scoutsFor = c => at(SCOUTS, c.staff?.scouting ?? 3);
export const scoutSpeed = c => at(SCOUT_SPEED, c.staff?.scouting ?? 3);
const standard = div => STANDARD[Math.min(div, STANDARD.length - 1)];
export const standardStaff = div => Object.fromEntries(AREAS.map(a => [a, standard(div)]));

// Every AI club's levels from its division and size (at a new world and every season start).
export function aiStaff(s) {
  for (const d of s.divisions) {
    const q = d.clubIds.map(id => s.clubs[id].quality).sort((a, b) => a - b), median = q[q.length >> 1];
    for (const id of d.clubIds) {
      if (id === s.me) continue;
      const c = s.clubs[id], step = Math.max(-1, Math.min(1, Math.round(c.quality - median)));
      c.staff = Object.fromEntries(AREAS.map(a => [a, Math.max(1, Math.min(5, standard(c.div) + step))]));
    }
  }
}

// Sets the human club's level in one area; the cost is paid weekly (payWeeks). Error message or null.
export function setStaff(s, area, level) {
  const c = s.clubs[s.me];
  if (!AREAS.includes(area) || !Number.isInteger(level) || level < 1 || level > 5) return 'Unknown staff level.';
  c.staff[area] = level;
  return null;
}
