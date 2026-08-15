export type RegionId =
  | 'neck'
  | 'traps'
  | 'shoulders'
  | 'rear_delts'
  | 'chest'
  | 'lats'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'hip_flexors'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'knees'
  | 'shins'
  | 'calves';

export const REGION_LABEL: Record<RegionId, string> = {
  neck: 'Neck',
  traps: 'Traps',
  shoulders: 'Front Delts',
  rear_delts: 'Rear Delts',
  chest: 'Chest',
  lats: 'Lats',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_back: 'Lower Back',
  hip_flexors: 'Hip Flexors',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  knees: 'Knees',
  shins: 'Shins',
  calves: 'Calves',
};

/** Joints get warning treatment rather than "burn here" treatment. */
export const JOINT_REGIONS: RegionId[] = ['knees', 'neck', 'lower_back', 'shoulders'];

export interface RegionShape {
  id: RegionId;
  d: string;
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * ANATOMICAL PLATE — viewBox 0 0 200 420
 *
 * Rebuilt around individual muscle HEADS rather than one blob per region,
 * because the heads are what make a plate read as anatomy instead of a
 * diagram. A region may therefore contribute several paths (quads = rectus
 * femoris + vastus lateralis + vastus medialis); the renderer already handles
 * repeated ids.
 *
 * The details that do the most work, and why each is shaped the way it is:
 *
 *   - VASTUS MEDIALIS sits LOW and medial — the teardrop just above the knee.
 *     VASTUS LATERALIS sits HIGH and lateral. Drawing the quad as one
 *     symmetrical slab is the single most obvious tell of a fake plate.
 *   - GASTROCNEMIUS has two heads and they are not level: the medial head is
 *     larger and hangs lower than the lateral.
 *   - PECTORALIS MAJOR fans from a wide sternal origin and CONVERGES to a
 *     narrow insertion on the humerus, so the fibres funnel outward-and-up.
 *   - RECTUS ABDOMINIS is crossed by three tendinous intersections, and they
 *     are not evenly spaced — they crowd toward the top.
 *   - DELTOID is three heads; only the anterior and lateral show from the front.
 *   - LATISSIMUS sweeps from the thoracolumbar fascia up to the armpit, which
 *     is what creates the V-taper, and it passes UNDER the arm.
 *   - SERRATUS ANTERIOR interdigitates with the obliques in finger-like slips
 *     over the ribs. Cheap to draw, and very recognisable.
 *
 * Shared landmarks across both views: shoulder line y=88, nipple y=118,
 * navel y=180, iliac crest y=200, groin y=224, knee y=310, ankle y=386.
 * ─────────────────────────────────────────────────────────────────────────
 */

/* ── FRONT ──────────────────────────────────────────────────────────────── */

export const FRONT_REGIONS: RegionShape[] = [
  // sternocleidomastoid — the two straps of the neck, not a rectangle
  { id: 'neck', d: 'M92,58 C90,68 86,76 82,82 L88,86 C93,79 96,70 97,60 Z' },
  { id: 'neck', d: 'M108,58 C110,68 114,76 118,82 L112,86 C107,79 104,70 103,60 Z' },

  // upper trapezius — slopes from neck to acromion
  { id: 'traps', d: 'M88,62 C95,66 105,66 112,62 C124,68 134,76 142,86 L132,92 C122,84 112,80 100,80 C88,80 78,84 68,92 L58,86 C66,76 76,68 88,62 Z' },

  // deltoid, anterior + lateral heads (left)
  { id: 'shoulders', d: 'M70,88 C58,92 50,102 48,116 C47,127 50,137 56,142 C59,127 62,110 72,100 Z' },
  { id: 'shoulders', d: 'M56,142 C62,144 68,140 71,132 C74,120 73,108 72,100 C62,110 58,126 56,142 Z' },
  // deltoid (right)
  { id: 'shoulders', d: 'M130,88 C142,92 150,102 152,116 C153,127 150,137 144,142 C141,127 138,110 128,100 Z' },
  { id: 'shoulders', d: 'M144,142 C138,144 132,140 129,132 C126,120 127,108 128,100 C138,110 142,126 144,142 Z' },

  // pectoralis major — clavicular head above, sternal head below.
  // Both converge laterally toward the humerus.
  { id: 'chest', d: 'M99,92 L99,110 C90,108 80,106 74,102 C78,96 88,92 99,92 Z' },
  { id: 'chest', d: 'M99,110 L99,140 C88,140 78,134 73,124 C71,116 72,108 74,102 C80,106 90,108 99,110 Z' },
  { id: 'chest', d: 'M101,92 L101,110 C110,108 120,106 126,102 C122,96 112,92 101,92 Z' },
  { id: 'chest', d: 'M101,110 L101,140 C112,140 122,134 127,124 C129,116 128,108 126,102 C120,106 110,108 101,110 Z' },

  // latissimus, visible from the front only as the flare under the armpit
  { id: 'lats', d: 'M72,124 C70,136 72,148 76,158 L82,152 C79,142 78,132 79,126 Z' },
  { id: 'lats', d: 'M128,124 C130,136 128,148 124,158 L118,152 C121,142 122,132 121,126 Z' },

  // biceps brachii — two-headed, tapering to the elbow tendon
  { id: 'biceps', d: 'M54,144 C50,156 50,170 53,182 C58,184 63,180 64,172 C65,160 63,150 60,142 Z' },
  { id: 'biceps', d: 'M146,144 C150,156 150,170 147,182 C142,184 137,180 136,172 C135,160 137,150 140,142 Z' },

  // forearm flexor mass — thick at the elbow, tapering hard to the wrist
  { id: 'forearms', d: 'M52,186 C48,200 47,216 49,232 L58,234 C60,218 61,202 62,188 Z' },
  { id: 'forearms', d: 'M148,186 C152,200 153,216 151,232 L142,234 C140,218 139,202 138,188 Z' },

  // rectus abdominis — two columns flanking the linea alba
  { id: 'abs', d: 'M92,142 C88,142 85,146 85,152 L85,196 C85,202 90,206 96,206 L98,206 L98,142 Z' },
  { id: 'abs', d: 'M108,142 C112,142 115,146 115,152 L115,196 C115,202 110,206 104,206 L102,206 L102,142 Z' },

  // external oblique — flanks the abs, inserts along the iliac crest
  { id: 'obliques', d: 'M84,150 C79,154 76,166 76,180 C76,192 79,200 84,206 L84,196 L83,152 Z' },
  { id: 'obliques', d: 'M116,150 C121,154 124,166 124,180 C124,192 121,200 116,206 L116,196 L117,152 Z' },

  // hip flexor / iliopsoas region at the inguinal line
  { id: 'hip_flexors', d: 'M84,206 C88,214 92,220 98,224 L98,208 C93,208 88,207 84,206 Z' },
  { id: 'hip_flexors', d: 'M116,206 C112,214 108,220 102,224 L102,208 C107,208 112,207 116,206 Z' },

  // ── quadriceps: three visible heads, deliberately asymmetric ──
  // vastus lateralis — HIGH and lateral
  { id: 'quads', d: 'M74,228 C68,240 66,258 68,276 C69,286 72,292 77,294 C79,276 80,254 82,234 Z' },
  { id: 'quads', d: 'M126,228 C132,240 134,258 132,276 C131,286 128,292 123,294 C121,276 120,254 118,234 Z' },
  // rectus femoris — central, runs the length of the thigh
  { id: 'quads', d: 'M84,230 C81,252 80,276 82,296 L94,298 C95,276 95,252 94,230 Z' },
  { id: 'quads', d: 'M116,230 C119,252 120,276 118,296 L106,298 C105,276 105,252 106,230 Z' },
  // vastus medialis — the teardrop, LOW and medial, just above the knee
  { id: 'quads', d: 'M84,272 C82,282 82,292 84,300 C88,304 94,304 96,300 L95,278 Z' },
  { id: 'quads', d: 'M116,272 C118,282 118,292 116,300 C112,304 106,304 104,300 L105,278 Z' },

  // patella
  { id: 'knees', d: 'M80,306 C78,314 79,322 83,326 C89,328 94,326 95,320 C96,312 94,306 90,304 Z' },
  { id: 'knees', d: 'M120,306 C122,314 121,322 117,326 C111,328 106,326 105,320 C104,312 106,306 110,304 Z' },

  // tibialis anterior — the shin muscle sits LATERAL to the bone, not on it
  { id: 'shins', d: 'M84,332 C81,346 80,362 81,378 L88,380 C89,362 90,346 91,332 Z' },
  { id: 'shins', d: 'M116,332 C119,346 120,362 119,378 L112,380 C111,362 110,346 109,332 Z' },

  // gastrocnemius seen from the front, only the bellies show at the edges
  { id: 'calves', d: 'M76,332 C73,344 73,358 76,368 L81,364 C80,352 80,342 82,334 Z' },
  { id: 'calves', d: 'M124,332 C127,344 127,358 124,368 L119,364 C120,352 120,342 118,334 Z' },
];

export const SHELL_FRONT = [
  // head + jaw
  // Cranium + jaw as separate curves — a single rounded blob is the fastest
  // way to make a figure read as a shop mannequin.
  'M100,8 C111,8 119,17 119,29 C119,36 117,42 114,47 C112,52 108,56 104,58 L96,58 C92,56 88,52 86,47 C83,42 81,36 81,29 C81,17 89,8 100,8 Z',
  // torso and legs — one continuous silhouette
  // Torso + legs. Athletic V-taper: widest across the deltoids (x 48-152),
  // narrowest at the waist (x 82-118), flaring again at the hips, then a
  // sweeping thigh, a defined knee, and a calf belly that sits HIGH on the
  // shank before tapering to a narrow ankle.
  'M92,58 C84,64 74,72 66,82 C58,92 52,104 50,118 L54,120 C57,106 64,96 74,89 C78,98 80,112 79,128 C78,146 77,164 79,180 C80,190 82,196 84,202 C86,212 89,219 93,226 C86,240 82,262 83,286 C84,300 85,312 87,324 C84,338 82,354 82,370 C82,380 83,388 84,394 L95,394 C96,386 96,376 95,366 C94,350 95,336 97,324 L97,230 L103,230 L103,324 C105,336 106,350 105,366 C104,376 104,386 105,394 L116,394 C117,388 118,380 118,370 C118,354 116,338 113,324 C115,312 116,300 117,286 C118,262 114,240 107,226 C111,219 114,212 116,202 C118,196 120,190 121,180 C123,164 122,146 121,128 C120,112 122,98 126,89 C136,96 143,106 146,120 L150,118 C148,104 142,92 134,82 C126,72 116,64 108,58 Z',
  // arms, drawn separately so the armpit reads correctly
  'M74,89 C62,95 53,106 51,119 C49,135 51,152 55,168 C58,180 57,194 54,208 C52,220 52,230 54,238 L64,238 C66,228 66,216 65,206 C64,192 66,180 68,168 C71,152 73,135 75,119 Z',
  'M126,89 C138,95 147,106 149,119 C151,135 149,152 145,168 C142,180 143,194 146,208 C148,220 148,230 146,238 L136,238 C134,228 134,216 135,206 C136,192 134,180 132,168 C129,152 127,135 125,119 Z',
  // feet
  'M84,394 C81,400 81,407 85,409 L97,409 C98,403 97,398 95,394 Z',
  'M116,394 C119,400 119,407 115,409 L103,409 C102,403 103,398 105,394 Z',
];

export const DETAIL_FRONT = [
  // clavicles
  'M84,86 C90,82 96,80 99,80', 'M116,86 C110,82 104,80 101,80',
  // sternum / linea alba
  'M100,92 L100,206',
  // pec fibre direction — converging toward the humerus
  'M96,116 C88,116 80,113 75,108', 'M96,126 C88,127 81,124 74,118',
  'M104,116 C112,116 120,113 125,108', 'M104,126 C112,127 119,124 126,118',
  // pec lower border
  'M74,124 C82,136 92,140 99,140', 'M126,124 C118,136 108,140 101,140',
  // tendinous intersections — crowded toward the top, as they are in life
  'M85,158 L98,158', 'M102,158 L115,158',
  'M85,174 L98,174', 'M102,174 L115,174',
  'M85,190 L98,190', 'M102,190 L115,190',
  // serratus anterior slips over the ribs
  'M80,140 L86,144', 'M79,148 L85,152', 'M78,156 L84,160',
  'M120,140 L114,144', 'M121,148 L115,152', 'M122,156 L116,160',
  // inguinal ligament
  'M84,206 C90,216 94,221 99,224', 'M116,206 C110,216 106,221 101,224',
  // rectus femoris borders
  'M84,232 C82,256 81,280 83,296', 'M116,232 C118,256 119,280 117,296',
  // knee line
  'M80,306 L96,306', 'M120,306 L104,306',
  // tibial crest
  'M92,332 C91,352 91,372 92,384', 'M108,332 C109,352 109,372 108,384',
];

/* ── BACK ───────────────────────────────────────────────────────────────── */

export const BACK_REGIONS: RegionShape[] = [
  { id: 'neck', d: 'M92,56 L108,56 L110,80 C105,84 95,84 90,80 Z' },

  // trapezius — the full diamond: upper, middle and lower fibres
  { id: 'traps', d: 'M100,58 C112,62 126,72 142,86 L132,94 C120,86 110,82 100,82 C90,82 80,86 68,94 L58,86 C74,72 88,62 100,58 Z' },
  { id: 'traps', d: 'M100,82 C112,82 124,88 132,94 L124,132 C116,124 108,120 100,120 C92,120 84,124 76,132 L68,94 C76,88 88,82 100,82 Z' },
  { id: 'traps', d: 'M100,120 C108,120 116,124 124,132 L100,168 L76,132 C84,124 92,120 100,120 Z' },

  // posterior deltoid
  { id: 'rear_delts', d: 'M70,88 C58,92 50,102 48,116 C47,127 50,137 56,142 C60,124 63,104 72,96 Z' },
  { id: 'rear_delts', d: 'M130,88 C142,92 150,102 152,116 C153,127 150,137 144,142 C140,124 137,104 128,96 Z' },

  // latissimus dorsi — the V-taper. Wide origin below, narrow insertion at the armpit.
  { id: 'lats', d: 'M76,132 C70,142 68,156 70,170 C72,182 76,190 82,196 L92,178 C86,166 82,150 80,136 Z' },
  { id: 'lats', d: 'M124,132 C130,142 132,156 130,170 C128,182 124,190 118,196 L108,178 C114,166 118,150 120,136 Z' },

  // triceps — long head plus lateral head
  { id: 'triceps', d: 'M54,144 C50,156 49,170 52,182 C57,184 62,180 63,172 C64,158 62,148 60,142 Z' },
  { id: 'triceps', d: 'M146,144 C150,156 151,170 148,182 C143,184 138,180 137,172 C136,158 138,148 140,142 Z' },

  { id: 'forearms', d: 'M52,186 C48,200 47,216 49,232 L58,234 C60,218 61,202 62,188 Z' },
  { id: 'forearms', d: 'M148,186 C152,200 153,216 151,232 L142,234 C140,218 139,202 138,188 Z' },

  // erector spinae — the two columns either side of the spine
  { id: 'lower_back', d: 'M92,168 C88,180 86,192 87,204 L97,204 L97,170 Z' },
  { id: 'lower_back', d: 'M108,168 C112,180 114,192 113,204 L103,204 L103,170 Z' },

  // gluteus maximus
  { id: 'glutes', d: 'M99,206 L99,244 C90,246 80,242 76,232 C73,222 75,212 80,206 Z' },
  { id: 'glutes', d: 'M101,206 L101,244 C110,246 120,242 124,232 C127,222 125,212 120,206 Z' },
  // gluteus medius, higher and lateral
  { id: 'glutes', d: 'M76,206 C72,212 71,220 73,228 L78,224 C77,216 78,210 80,206 Z' },
  { id: 'glutes', d: 'M124,206 C128,212 129,220 127,228 L122,224 C123,216 122,210 120,206 Z' },

  // hamstrings — biceps femoris lateral, semitendinosus/membranosus medial
  { id: 'hamstrings', d: 'M76,248 C72,264 71,282 74,298 L84,298 C83,280 84,262 86,248 Z' },
  { id: 'hamstrings', d: 'M124,248 C128,264 129,282 126,298 L116,298 C117,280 116,262 114,248 Z' },
  { id: 'hamstrings', d: 'M88,248 C86,264 86,282 88,298 L98,298 C98,280 98,262 98,248 Z' },
  { id: 'hamstrings', d: 'M112,248 C114,264 114,282 112,298 L102,298 C102,280 102,262 102,248 Z' },

  // popliteal fossa — back of the knee
  { id: 'knees', d: 'M80,302 C79,310 81,318 86,320 L94,318 C95,310 94,304 92,300 Z' },
  { id: 'knees', d: 'M120,302 C121,310 119,318 114,320 L106,318 C105,310 106,304 108,300 Z' },

  // gastrocnemius — TWO heads, medial larger and hanging lower than lateral
  { id: 'calves', d: 'M78,326 C74,340 74,354 78,364 L86,360 C85,348 86,336 88,328 Z' },
  { id: 'calves', d: 'M90,328 C88,342 88,358 90,372 L98,370 C99,354 99,340 98,328 Z' },
  { id: 'calves', d: 'M122,326 C126,340 126,354 122,364 L114,360 C115,348 114,336 112,328 Z' },
  { id: 'calves', d: 'M110,328 C112,342 112,358 110,372 L102,370 C101,354 101,340 102,328 Z' },
];

export const SHELL_BACK = [
  // Cranium + jaw as separate curves — a single rounded blob is the fastest
  // way to make a figure read as a shop mannequin.
  'M100,8 C111,8 119,17 119,29 C119,36 117,42 114,47 C112,52 108,56 104,58 L96,58 C92,56 88,52 86,47 C83,42 81,36 81,29 C81,17 89,8 100,8 Z',
  // Torso + legs. Athletic V-taper: widest across the deltoids (x 48-152),
  // narrowest at the waist (x 82-118), flaring again at the hips, then a
  // sweeping thigh, a defined knee, and a calf belly that sits HIGH on the
  // shank before tapering to a narrow ankle.
  'M92,58 C84,64 74,72 66,82 C58,92 52,104 50,118 L54,120 C57,106 64,96 74,89 C78,98 80,112 79,128 C78,146 77,164 79,180 C80,190 82,196 84,202 C86,212 89,219 93,226 C86,240 82,262 83,286 C84,300 85,312 87,324 C84,338 82,354 82,370 C82,380 83,388 84,394 L95,394 C96,386 96,376 95,366 C94,350 95,336 97,324 L97,230 L103,230 L103,324 C105,336 106,350 105,366 C104,376 104,386 105,394 L116,394 C117,388 118,380 118,370 C118,354 116,338 113,324 C115,312 116,300 117,286 C118,262 114,240 107,226 C111,219 114,212 116,202 C118,196 120,190 121,180 C123,164 122,146 121,128 C120,112 122,98 126,89 C136,96 143,106 146,120 L150,118 C148,104 142,92 134,82 C126,72 116,64 108,58 Z',
  'M74,89 C62,95 53,106 51,119 C49,135 51,152 55,168 C58,180 57,194 54,208 C52,220 52,230 54,238 L64,238 C66,228 66,216 65,206 C64,192 66,180 68,168 C71,152 73,135 75,119 Z',
  'M126,89 C138,95 147,106 149,119 C151,135 149,152 145,168 C142,180 143,194 146,208 C148,220 148,230 146,238 L136,238 C134,228 134,216 135,206 C136,192 134,180 132,168 C129,152 127,135 125,119 Z',
  'M84,394 C81,400 81,407 85,409 L97,409 C98,403 97,398 95,394 Z',
  'M116,394 C119,400 119,407 115,409 L103,409 C102,403 103,398 105,394 Z',
];

export const DETAIL_BACK = [
  // spine
  'M100,58 L100,206',
  // scapular borders
  'M84,96 L92,124', 'M116,96 L108,124',
  // trapezius fibre direction
  'M100,84 L78,94', 'M100,84 L122,94',
  'M100,122 L80,130', 'M100,122 L120,130',
  // lat fibre sweep, converging up into the armpit
  'M82,190 C86,172 88,152 88,138', 'M118,190 C114,172 112,152 112,138',
  'M76,170 C82,158 86,146 88,136', 'M124,170 C118,158 114,146 112,136',
  // thoracolumbar fascia
  'M88,196 C94,200 106,200 112,196',
  // iliac crest
  'M78,206 C88,202 112,202 122,206',
  // gluteal fold — the crease under the glute, a strong read from behind
  'M78,242 C86,248 94,250 99,250', 'M122,242 C114,248 106,250 101,250',
  // hamstring separation
  'M87,250 C86,268 86,286 87,298', 'M113,250 C114,268 114,286 113,298',
  // knee crease
  'M80,304 L94,304', 'M120,304 L106,304',
  // achilles
  'M92,372 C92,380 92,386 93,392', 'M108,372 C108,380 108,386 107,392',
];
