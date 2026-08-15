import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  ALLOWED_MIME,
  EQUIPMENT_SCHEMA,
  EQUIPMENT_SYSTEM,
  MAX_IMAGE_BYTES,
  NUTRITION_SCHEMA,
  NUTRITION_SYSTEM,
  mockEquipment,
  mockNutrition,
  type AllowedMime,
} from '@/lib/vision';
import { transcriptDirective } from '@/lib/voice';
import type {
  EquipmentOcrData,
  NutritionVisionData,
  VisionEnvelope,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Mode = 'equipment_ocr' | 'nutrition_vision';

interface RequestBody {
  mode?: Mode;
  imageBase64?: string;
  mimeType?: string;
  /** Optional voice note about the portion. Nutrition mode only. */
  transcript?: string;
}

/**
 * A transcript is user speech, but it lands in a prompt that produces a
 * health-adjacent number. Cap it so a long dictation cannot crowd out the
 * system prompt, and strip control characters.
 */
const MAX_TRANSCRIPT_CHARS = 1200;

function sanitizeTranscript(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5';

function fail(message: string, status: number) {
  return NextResponse.json({ status: 'error', message }, { status });
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return fail('Malformed JSON body.', 400);
  }

  const mode = body.mode;
  if (mode !== 'equipment_ocr' && mode !== 'nutrition_vision') {
    return fail('mode must be "equipment_ocr" or "nutrition_vision".', 400);
  }

  const base64 = (body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, '');

  // A voice note only makes sense for meals; a console reading has no portion.
  const transcript =
    mode === 'nutrition_vision' && body.transcript
      ? sanitizeTranscript(body.transcript)
      : '';

  // ── voice-only meals ───────────────────────────────────────────────────
  // A photo is not always available: people eat, then remember to log on the
  // drive home. Requiring an image made the app unusable for exactly the meals
  // most likely to go unlogged. Spoken portion descriptions also land within
  // 10% of weighed truth more often than image-based estimation does, so a
  // description alone is a legitimate input, not a degraded one — what it
  // loses is identification, not quantity.
  const voiceOnly = mode === 'nutrition_vision' && !base64 && transcript.length > 0;

  if (!base64 && !voiceOnly) {
    return fail(
      mode === 'nutrition_vision'
        ? 'Send a photo, or describe the meal out loud.'
        : 'imageBase64 is required.',
      400,
    );
  }

  // base64 inflates by 4/3; check the decoded size.
  if (base64 && (base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return fail('Image exceeds the 5 MB limit. Re-capture at a lower resolution.', 413);
  }

  const mimeType = (body.mimeType ?? 'image/jpeg') as AllowedMime;
  if (base64 && !ALLOWED_MIME.includes(mimeType)) {
    return fail(`mimeType must be one of: ${ALLOWED_MIME.join(', ')}.`, 415);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  // ─── Mock fallback: no key configured ──────────────────────────────────────
  if (!apiKey) {
    if (mode === 'equipment_ocr') {
      const { data, roast } = mockEquipment(base64);
      return NextResponse.json<VisionEnvelope<EquipmentOcrData>>({
        status: 'success',
        type: 'equipment_ocr',
        data,
        roast_or_hype: roast,
        source: 'mock',
      });
    }
    const { data, roast } = mockNutrition(base64, transcript);
    return NextResponse.json<VisionEnvelope<NutritionVisionData>>({
      status: 'success',
      type: 'nutrition_vision',
      data,
      roast_or_hype: roast,
      source: 'mock',
    });
  }

  // ─── Live vision call ──────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey });

  const isOcr = mode === 'equipment_ocr';
  const system = isOcr ? EQUIPMENT_SYSTEM : NUTRITION_SYSTEM;
  const schema = isOcr ? EQUIPMENT_SCHEMA : NUTRITION_SCHEMA;

  const instruction = isOcr
    ? 'Read this cardio machine console and return the structured reading.'
    : voiceOnly
      ? `There is NO photo of this meal — only a spoken description. Estimate the macros from the description alone.

${transcriptDirective(transcript)}

Because you cannot see the plate:
- Identify the dish from what they said. If the description is ambiguous between
  two common Malaysian dishes, pick the more common one and say so in portion_note.
- Assume nothing they did not mention. Do not add a drink, a side or a sauce that
  was not described — an invented item is a worse error here than a missing one.
- confidence is at most "medium" without a photo, and "low" if they did not state
  a quantity for the main component.`
      : transcript
        ? `Estimate the macros for this meal and return the structured reading.\n\n${transcriptDirective(transcript)}`
        : 'Estimate the macros for this meal and return the structured reading.';

  // Gym-floor latency matters more than depth here: thinking off, low effort.
  // `output_config.format` guarantees the response parses against the schema.
  const params = {
    model: MODEL,
    max_tokens: 2048,
    system,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    messages: [
      {
        role: 'user',
        content: [
          // No image block at all when logging by voice — sending an empty one
          // is a 400 from the API.
          ...(voiceOnly
            ? []
            : [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType, data: base64 },
                },
              ]),
          { type: 'text', text: instruction },
        ],
      },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  try {
    const response = await anthropic.messages.create(params);

    if (response.stop_reason === 'refusal') {
      return fail('The vision model declined this image. Try a different capture.', 422);
    }
    if (response.stop_reason === 'max_tokens') {
      return fail('Vision response was truncated. Retry the capture.', 502);
    }

    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      return fail('Vision model returned no readable payload.', 502);
    }

    const parsed = JSON.parse(text.text) as
      | (EquipmentOcrData & { roast_or_hype: string })
      | (NutritionVisionData & { roast_or_hype: string });

    const { roast_or_hype, ...data } = parsed;

    return NextResponse.json({
      status: 'success',
      type: mode,
      data,
      roast_or_hype: roast_or_hype || 'Logged. Say nothing, do the next one.',
      source: 'live',
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail('Vision service is rate limited. Wait a moment and re-scan.', 429);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return fail('Could not reach the vision service. Gym Mode needs internet.', 503);
    }
    if (error instanceof Anthropic.APIError) {
      return fail(`Vision service error (${error.status}): ${error.message}`, 502);
    }
    if (error instanceof SyntaxError) {
      return fail('Vision model returned unparseable JSON.', 502);
    }
    return fail('Unexpected vision failure.', 500);
  }
}
