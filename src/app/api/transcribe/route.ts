import { NextResponse } from 'next/server';
import { HAWKER_VOCAB, MAX_AUDIO_BYTES } from '@/lib/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Speech-to-text for meal voice notes.
 *
 * Claude does not accept audio on the Messages API — it takes text and images —
 * so transcription is a mandatory separate hop before the transcript can ride
 * along with the photo in a single vision call.
 *
 * Provider is env-selected because the right one for code-switched Manglish is
 * an open question, and the app should not be welded to whichever we tried
 * first. Falls back to a mock so the whole flow is exercisable with no key, the
 * same way /api/vision does.
 */

type Provider = 'elevenlabs' | 'openai' | 'mock';

function resolveProvider(): { provider: Provider; apiKey: string } {
  const eleven = process.env.ELEVENLABS_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  const forced = process.env.STT_PROVIDER?.trim().toLowerCase();

  if (forced === 'elevenlabs' && eleven) return { provider: 'elevenlabs', apiKey: eleven };
  if (forced === 'openai' && openai) return { provider: 'openai', apiKey: openai };

  // ElevenLabs Scribe first: it benchmarks best on multilingual, which is the
  // binding constraint here — this is Malay-English code-switching, not en-US.
  if (eleven) return { provider: 'elevenlabs', apiKey: eleven };
  if (openai) return { provider: 'openai', apiKey: openai };
  return { provider: 'mock', apiKey: '' };
}

function fail(message: string, status: number) {
  return NextResponse.json({ status: 'error', message }, { status });
}

/**
 * Rotating mock transcripts. Deliberately written the way people actually
 * speak — hesitations, code-switching, self-corrections — so the downstream
 * prompt is exercised against realistic input rather than tidy sentences.
 */
const MOCK_TRANSCRIPTS = [
  'about one fist of rice lah, and the chicken maybe half a palm, skin on',
  'teh tarik one glass, kurang manis. rice maybe two fist, quite a lot actually',
  'erm the chicken was fried, one whole thigh. rice one scoop only. not sure how much exactly',
  'half plate only, I tapau the rest. one palm chicken, no skin',
];

function seedFrom(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 97) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data with an "audio" field.', 400);
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob)) return fail('audio field is required.', 400);
  if (audio.size === 0) return fail('Audio was empty. Hold the button and speak.', 400);
  if (audio.size > MAX_AUDIO_BYTES) {
    return fail('Voice note too long. Keep it under 15 seconds.', 413);
  }

  const { provider, apiKey } = resolveProvider();

  if (provider === 'mock') {
    const seed = seedFrom(String(audio.size) + String(audio.type));
    return NextResponse.json({
      status: 'success',
      transcript: MOCK_TRANSCRIPTS[seed % MOCK_TRANSCRIPTS.length],
      source: 'mock',
    });
  }

  try {
    const transcript =
      provider === 'elevenlabs'
        ? await viaElevenLabs(audio, apiKey)
        : await viaOpenAI(audio, apiKey);

    if (!transcript.trim()) {
      return fail('Could not make out any speech. Try again somewhere quieter.', 422);
    }
    return NextResponse.json({ status: 'success', transcript, source: provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed.';
    return fail(message, 502);
  }
}

/**
 * ElevenLabs Scribe. `language_code` is left unset on purpose — pinning it to
 * either 'en' or 'ms' is wrong for a sentence that switches between them
 * mid-clause, which is the normal case here.
 */
async function viaElevenLabs(audio: Blob, apiKey: string): Promise<string> {
  const body = new FormData();
  body.append('file', audio, 'note.webm');
  body.append('model_id', 'scribe_v1');
  body.append('tag_audio_events', 'false');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body,
  });

  if (!res.ok) {
    throw new Error(`Transcription service error (${res.status}).`);
  }
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

/**
 * Whisper. The `prompt` field is Whisper's only vocabulary-biasing lever, and
 * it matters a lot here — an en-US-weighted model will otherwise turn "kway
 * teow" into something unrecognisable. Capped because Whisper only reads the
 * final ~224 tokens of it.
 */
async function viaOpenAI(audio: Blob, apiKey: string): Promise<string> {
  const body = new FormData();
  body.append('file', audio, 'note.webm');
  body.append('model', 'whisper-1');
  body.append('prompt', HAWKER_VOCAB.slice(0, 60).join(', '));

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  if (!res.ok) {
    throw new Error(`Transcription service error (${res.status}).`);
  }
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}
