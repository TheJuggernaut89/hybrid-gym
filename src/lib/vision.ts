import type { EquipmentOcrData, NutritionVisionData } from './types';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

/**
 * Structured-output schemas. Constraints the API supports only: types, enum,
 * anyOf, required, additionalProperties:false. No min/max, no minLength.
 */
export const EQUIPMENT_SCHEMA = {
  type: 'object',
  properties: {
    equipment_type: {
      type: 'string',
      enum: ['assault_bike', 'rower', 'treadmill', 'ski_erg', 'other'],
      description: 'Machine the console belongs to.',
    },
    time_display: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Elapsed time exactly as printed, e.g. "12:34". Null if unreadable.',
    },
    active_minutes: {
      ...nullableNumber,
      description: 'time_display converted to decimal minutes.',
    },
    distance_m: { ...nullableNumber, description: 'Distance in metres.' },
    calories: { ...nullableNumber, description: 'Calories burned as shown on the console.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    unreadable_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Field names you could not read with confidence.',
    },
    roast_or_hype: {
      type: 'string',
      description:
        'ONE short line of coach commentary on this effort. Malaysian gym-floor voice. No emoji, no corporate encouragement.',
    },
  },
  required: [
    'equipment_type',
    'time_display',
    'active_minutes',
    'distance_m',
    'calories',
    'confidence',
    'unreadable_fields',
    'roast_or_hype',
  ],
  additionalProperties: false,
} as const;

export const NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    dish_name: {
      type: 'string',
      description: 'Local name of the dish where one exists, e.g. "Nasi Lemak".',
    },
    portion_note: {
      type: 'string',
      description: 'Short portion read, e.g. "One full plate, extra sambal".',
    },
    calories: nullableNumber,
    protein_g: nullableNumber,
    carbs_g: nullableNumber,
    fats_g: nullableNumber,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    items: {
      type: 'array',
      items: { type: 'string' },
      description: 'Individual components identified on the plate.',
    },
    // Portion is the dominant error term in image-based macro estimation, so
    // the app has to be able to show WHERE the number came from — a guess at
    // volume from a flat photo, or something the eater actually stated.
    portion_basis: {
      type: 'string',
      description:
        'What the portion estimate rests on. "Visual estimate" when working from the image alone. When a voice transcript was supplied, name what you took from it, e.g. "Stated: one fist rice, half palm chicken, skin on".',
    },
    stated_confidence: {
      anyOf: [{ type: 'string', enum: ['sure', 'unsure'] }, { type: 'null' }],
      description:
        'Only from a voice transcript: whether the eater expressed confidence about the quantity. "unsure" if they said anything like "not sure how much". Null when no transcript was supplied or they did not say.',
    },
    roast_or_hype: {
      type: 'string',
      description:
        'ONE short line of localized coach commentary on this meal. Malaysian gym-floor voice. No emoji, no corporate encouragement.',
    },
  },
  required: [
    'dish_name',
    'portion_note',
    'calories',
    'protein_g',
    'carbs_g',
    'fats_g',
    'confidence',
    'items',
    'portion_basis',
    'stated_confidence',
    'roast_or_hype',
  ],
  additionalProperties: false,
} as const;

export const EQUIPMENT_SYSTEM = `You read cardio-machine consoles for a combat gym in Damansara, Malaysia.

Extract ONLY what is legibly printed on the display. Rules:
- Never invent a number. If a field is glared out, cropped, or blurred, return null and name it in unreadable_fields.
- Assault bike and Concept2 rower consoles are the common case; identify the machine from the console layout when the brand is not visible.
- Convert time_display to active_minutes as a decimal (12:30 -> 12.5).
- Distance is metres. If the console shows km, convert. If it shows a pace rather than a distance, leave distance_m null.
- confidence is "low" whenever more than one primary field is unreadable.

roast_or_hype is one line of coach commentary on the effort — the voice of a Malaysian gym floor, not a wellness app. Dry, direct, occasionally rude. No emoji, no exclamation stacking, no "great job champ".`;

export const NUTRITION_SYSTEM = `You are a fight-camp nutrition coach in Damansara, Malaysia. You estimate macros from a photo of a meal.

Rules:
- Name the dish the way a Malaysian would: nasi lemak, char kway teow, roti canai, mee goreng, chicken rice, banana leaf, cendol. Do not anglicise it.
- Estimate for the portion actually visible, not a standard serving. Say so in portion_note.
- Malaysian cooking is oil- and coconut-heavy; do not under-count fats.
- If the photo is too dark or ambiguous to read, set confidence "low" and give a conservative range midpoint rather than refusing.
- Portion is the weakest part of any photo estimate — a photograph carries no depth, so volume is inferred. Be honest about that in portion_basis, and set confidence "low" when you are estimating volume off a single flat image with no scale reference in frame.
- Drinks are the worst case: a glass in a photo gives almost no reliable volume signal, and sweetened local drinks carry serious calories. Never treat a drink as incidental.

roast_or_hype is one line of coach commentary on the meal — dry, direct, local. Reference the actual dish. No emoji, no "great choice!", no lecturing about clean eating.

These are estimates for training feedback, not clinical nutrition advice.`;

// ─── Mock fallback (no ANTHROPIC_API_KEY) ────────────────────────────────────

/** Small deterministic hash so mock output varies per capture but is stable. */
function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < Math.min(input.length, 2048); i += 7) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const BIKE_ROASTS = [
  'Bike says done. Your legs said done 4 minutes ago. Log it.',
  'Respectable. Now do it again tomorrow before you talk about it.',
  'That is a warm-up, bro. But a logged warm-up beats an imagined session.',
  'Solid burn. Go drink water — actual water, not teh ais.',
];

const FOOD_LINES = [
  'Nasi lemak on a cut? Bold. Walk it off — 40 minutes, no excuses.',
  'Protein is decent lah. Carbs are doing all the talking though.',
  'Good plate. Add an egg next time and it is a proper fight-camp meal.',
  'Heavy on oil. Not a crime — just do not stack it two meals in a row.',
];

export function mockEquipment(seedSource: string): {
  data: EquipmentOcrData;
  roast: string;
} {
  const seed = seedFrom(seedSource);
  const minutes = 8 + (seed % 17); // 8–24
  const calories = Math.round(minutes * (9 + (seed % 5)));
  const distance = Math.round(minutes * (300 + (seed % 90)));
  const isRower = seed % 3 === 0;

  return {
    data: {
      equipment_type: isRower ? 'rower' : 'assault_bike',
      time_display: `${String(minutes).padStart(2, '0')}:${String(seed % 60).padStart(2, '0')}`,
      active_minutes: minutes,
      distance_m: distance,
      calories,
      confidence: 'medium',
      unreadable_fields: [],
    },
    roast: `[MOCK] ${BIKE_ROASTS[seed % BIKE_ROASTS.length]}`,
  };
}

/**
 * `transcript` is honoured by the mock so the voice path is exercisable end to
 * end with no API key — including the part that matters most: that supplying a
 * portion visibly moves the numbers and raises confidence.
 */
export function mockNutrition(seedSource: string, transcript = ''): {
  data: NutritionVisionData;
  roast: string;
} {
  const seed = seedFrom(seedSource);
  const dishes = [
    { dish_name: 'Nasi Lemak (ayam goreng)', items: ['Coconut rice', 'Fried chicken', 'Sambal', 'Egg', 'Peanuts', 'Anchovies'] },
    { dish_name: 'Char Kway Teow', items: ['Flat rice noodles', 'Prawns', 'Egg', 'Bean sprouts', 'Chinese sausage'] },
    { dish_name: 'Chicken Rice (steamed)', items: ['Steamed chicken', 'Chicken rice', 'Cucumber', 'Chilli sauce'] },
    { dish_name: 'Roti Canai + Dhal', items: ['Roti canai', 'Dhal curry'] },
  ];
  const t = transcript.toLowerCase();
  const spoke = t.length > 0;

  // When the description names a dish we know, honour it. A mock that answers
  // "char kway teow" to someone who clearly said "nasi lemak" makes the whole
  // voice path look broken during a demo.
  const named = spoke
    ? dishes.find((d) =>
        d.dish_name
          .toLowerCase()
          .replace(/\(.*\)/, '')
          .trim()
          .split(' ')
          .some((w) => w.length > 3 && t.includes(w)),
      )
    : undefined;

  const pick = named ?? dishes[seed % dishes.length];
  const base = 480 + (seed % 460);

  // Crude but directionally honest: stated portions shrink or grow the estimate
  // and firm up confidence, which is exactly what the real model should do.
  let factor = 1;
  if (/\bhalf\b|separuh|small|sikit|tapau/.test(t)) factor = 0.6;
  else if (/two fist|2 fist|double|banyak|large|big|extra/.test(t)) factor = 1.4;
  else if (/one fist|1 fist|one scoop|one palm|a palm/.test(t)) factor = 0.85;

  const calories = Math.round(base * factor);
  const unsure = /not sure|tak pasti|maybe|roughly|about/.test(t);

  return {
    data: {
      ...pick,
      portion_note: spoke
        ? 'Portion taken from the voice note, not the photo.'
        : 'One standard plate — estimated from a mock capture.',
      calories,
      protein_g: Math.round((calories * 0.16) / 4),
      carbs_g: Math.round((calories * 0.48) / 4),
      fats_g: Math.round((calories * 0.36) / 9),
      // A stated portion is better evidence than a flat photo, so confidence
      // rises — unless they told you they were guessing.
      //
      // Voice-only (no image at all) is capped at "medium" to match the live
      // prompt: a description fixes the portion but nothing corroborates the
      // identification, so the mock must not look more certain than production.
      confidence: !spoke
        ? 'low'
        : unsure
          ? 'medium'
          : seedSource.length === 0
            ? 'medium'
            : 'high',
      portion_basis: spoke
        ? `Stated: ${transcript.slice(0, 80)}`
        : 'Visual estimate — no scale reference in frame.',
      stated_confidence: spoke ? (unsure ? 'unsure' : 'sure') : null,
    },
    roast: `[MOCK] ${FOOD_LINES[seed % FOOD_LINES.length]}`,
  };
}
