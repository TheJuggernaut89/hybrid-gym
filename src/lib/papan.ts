/**
 * PAPAN MARKAH — the weekly gym scoreboard.
 *
 * WhatsApp is where this gym actually lives, so the output is built for that
 * renderer: a monospace text block that gets *replied to*, plus an image for
 * people who scroll. Both, because text and images do different jobs in a group.
 *
 * Privacy is the load-bearing part, not a footnote:
 *   - members must opt in; there is no default-on scoreboard
 *   - nicknames only, never the legal name on the membership
 *   - a k-anonymity floor: below MIN_COHORT the board does not render at all,
 *     because in a forty-person gym a "bottom of the table" row is a person
 *   - it ranks *consistency*, not weight, body composition or calories
 */

export const MIN_COHORT = 5;

export interface PapanEntry {
  nickname: string;
  /** Sessions in the trailing 28 days. */
  sessions: number;
  /** Sessions per week. */
  tempo: number;
  /** Delta vs the previous 28 days. */
  delta: number;
  isSelf: boolean;
}

export interface PapanBoard {
  ok: boolean;
  /** Why the board is withheld, when it is. */
  reason: string | null;
  entries: Array<PapanEntry & { rank: number }>;
  selfRank: number | null;
  cohort: number;
  weekLabel: string;
}

export function buildBoard(
  entries: PapanEntry[],
  now = new Date(),
): PapanBoard {
  const weekLabel = weekOf(now);

  if (entries.length < MIN_COHORT) {
    return {
      ok: false,
      // Stated plainly rather than silently showing an empty board.
      reason: `Needs ${MIN_COHORT} opted-in members to publish. Currently ${entries.length}.`,
      entries: [],
      selfRank: null,
      cohort: entries.length,
      weekLabel,
    };
  }

  const ranked = [...entries]
    .sort((a, b) => b.sessions - a.sessions || b.tempo - a.tempo)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    ok: true,
    reason: null,
    entries: ranked,
    selfRank: ranked.find((e) => e.isSelf)?.rank ?? null,
    cohort: ranked.length,
    weekLabel,
  };
}

/** ISO-ish week label, e.g. "W33 · 2026". */
export function weekOf(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `W${String(week).padStart(2, '0')} · ${d.getUTCFullYear()}`;
}

const WIDTH = 30;

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
}

/**
 * The monospace block for the group chat. Kept to 30 columns so it does not
 * wrap on a narrow phone — a wrapped table is worse than no table.
 */
export function whatsappBlock(board: PapanBoard, gymName = 'HYBRID COMBATIVE'): string {
  if (!board.ok) return '';

  const lines: string[] = [];
  lines.push('```');
  lines.push(pad(gymName.toUpperCase().slice(0, WIDTH), WIDTH));
  lines.push(`PAPAN MARKAH  ${padLeft(board.weekLabel, WIDTH - 14)}`);
  lines.push('-'.repeat(WIDTH));

  for (const e of board.entries.slice(0, 10)) {
    const rank = padLeft(String(e.rank), 2);
    const name = pad(e.isSelf ? `${e.nickname} *` : e.nickname, 14);
    const sess = padLeft(String(e.sessions), 3);
    const tempo = padLeft(e.tempo.toFixed(1), 5);
    lines.push(`${rank} ${name}${sess}  ${tempo}`);
  }

  lines.push('-'.repeat(WIDTH));
  lines.push(pad('   NAME          28D  /WK', WIDTH));
  lines.push('```');

  return lines.join('\n');
}

/** One line of commentary under the block. Dry, never a motivational poster. */
export function boardCaption(board: PapanBoard): string {
  if (!board.ok) return '';
  const top = board.entries[0];
  const self = board.entries.find((e) => e.isSelf);

  if (self && self.rank === 1) {
    return `${top.nickname} top of the board with ${top.sessions} sessions. Someone go take it off them.`;
  }
  if (self && self.delta > 0.4) {
    return `${top.nickname} leads on ${top.sessions}. ${self.nickname} climbing — up ${self.delta.toFixed(1)}/wk.`;
  }
  return `${top.nickname} leads on ${top.sessions} sessions this month. Board resets Monday.`;
}
