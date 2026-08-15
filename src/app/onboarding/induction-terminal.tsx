'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeInduction } from '@/app/actions/fighter';
import { cn } from '@/lib/utils';
import type { BiologicalData } from '@/lib/types';

const CONDITIONS = [
  'Hypertension',
  'Asthma',
  'Diabetes',
  'Knee injury',
  'Shoulder injury',
  'Lower back issues',
  'Wrist / hand injury',
  'Concussion history',
  'Heart condition',
];

const GOALS = [
  'Weight cut',
  'Striking technique',
  'Conditioning',
  'Grappling base',
  'Injury rehab',
  'Fight prep',
];

const STEPS = ['IDENT', 'BIOMETRICS', 'MEDICAL', 'OBJECTIVES', 'CONFIRM'] as const;

const SPRING = { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.6 };

export function InductionTerminal({
  demo,
  defaultName,
}: {
  demo: boolean;
  defaultName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState(defaultName);
  const [clanTag, setClanTag] = useState('DAMANSARA');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<BiologicalData['sex'] | ''>('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [otherCondition, setOtherCondition] = useState('');
  const [goals, setGoals] = useState<string[]>([]);

  const medicalList = useMemo(() => {
    const extra = otherCondition.trim();
    return extra ? [...conditions, extra] : conditions;
  }, [conditions, otherCondition]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length >= 2;
      case 1:
        return Boolean(age && sex && heightCm && weightKg);
      case 2:
        return true;
      case 3:
        return goals.length > 0;
      default:
        return true;
    }
  }, [step, name, age, sex, heightCm, weightKg, goals]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    const result = await completeInduction({
      name,
      clanTag,
      biological: {
        age: Number(age) || undefined,
        sex: (sex || undefined) as BiologicalData['sex'],
        height_cm: Number(heightCm) || undefined,
        weight_kg: Number(weightKg) || undefined,
      },
      medicalConditions: medicalList,
      goals,
    });

    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    router.push('/hud');
    router.refresh();
  }

  return (
    <div className="border border-edge bg-surface">
      {/* ─ terminal chrome ─ */}
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="font-mono text-meta tracking-[0.2em] text-gold">
          FIGHTER INDUCTION
        </span>
        <span className="font-mono text-meta tracking-[0.2em] text-dim">
          {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
        </span>
      </div>

      {/* ─ step rail ─ */}
      <div className="flex border-b border-edge">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'flex-1 border-r border-edge px-1 py-1.5 text-center last:border-r-0',
              i < step && 'bg-gold/15 text-gold',
              i === step && 'bg-gold text-canvas',
              i > step && 'text-faint',
            )}
          >
            <span className="font-mono text-micro tracking-[0.12em]">{label}</span>
          </div>
        ))}
      </div>

      <div className="min-h-[340px] p-4">
        {/* Keyed remount rather than AnimatePresence: the step only needs an
            entrance animation, and this never leaves a step stranded mid-exit. */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={SPRING}
        >
            {step === 0 && (
              <StepBlock
                prompt="IDENTIFY YOURSELF"
                hint="This is the name that lands on your brag cards."
              >
                <Field label="FIGHTER NAME">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    autoFocus
                    placeholder="HARSHANA"
                    className={inputClass}
                  />
                </Field>
                <Field label="CLAN TAG">
                  <input
                    value={clanTag}
                    onChange={(e) => setClanTag(e.target.value.toUpperCase())}
                    maxLength={16}
                    className={inputClass}
                  />
                </Field>
              </StepBlock>
            )}

            {step === 1 && (
              <StepBlock
                prompt="BIOLOGICAL METRICS"
                hint="Used to size calorie estimates and drill intensity."
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="AGE">
                    <input
                      value={age}
                      onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      inputMode="numeric"
                      placeholder="27"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="WEIGHT (KG)">
                    <input
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
                      inputMode="decimal"
                      placeholder="78"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="HEIGHT (CM)">
                    <input
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      inputMode="numeric"
                      placeholder="174"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="SEX">
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value as BiologicalData['sex'])}
                      className={cn(inputClass, 'appearance-none')}
                    >
                      <option value="">—</option>
                      <option value="male">MALE</option>
                      <option value="female">FEMALE</option>
                      <option value="other">OTHER</option>
                    </select>
                  </Field>
                </div>
              </StepBlock>
            )}

            {step === 2 && (
              <StepBlock
                prompt="MEDICAL FLAGS"
                hint="Flagged joints get watched during Form Check. Be honest — nobody sees this but you."
              >
                <ChipGrid
                  options={CONDITIONS}
                  selected={conditions}
                  onToggle={(v) => toggle(conditions, setConditions, v)}
                  accent="fight"
                />
                <Field label="OTHER">
                  <input
                    value={otherCondition}
                    onChange={(e) => setOtherCondition(e.target.value)}
                    maxLength={60}
                    placeholder="Anything else the coach should know"
                    className={inputClass}
                  />
                </Field>
              </StepBlock>
            )}

            {step === 3 && (
              <StepBlock
                prompt="COMBAT OBJECTIVES"
                hint="Pick at least one. Bounties key off these."
              >
                <ChipGrid
                  options={GOALS}
                  selected={goals}
                  onToggle={(v) => toggle(goals, setGoals, v)}
                  accent="gold"
                />
              </StepBlock>
            )}

            {step === 4 && (
              <StepBlock prompt="CONFIRM DOSSIER" hint="Everything here is editable later.">
                <dl className="divide-y divide-edge border border-edge">
                  <Row k="NAME" v={name || '—'} />
                  <Row k="CLAN" v={clanTag || 'HYBRID'} />
                  <Row
                    k="BIO"
                    v={`${age || '—'}Y / ${sex ? sex.toUpperCase() : '—'} / ${heightCm || '—'}CM / ${weightKg || '—'}KG`}
                  />
                  <Row k="MEDICAL" v={medicalList.length ? medicalList.join(', ') : 'NONE DECLARED'} />
                  <Row k="GOALS" v={goals.length ? goals.join(', ') : '—'} />
                </dl>
                {demo ? (
                  <p className="mt-3 border-l-2 border-fight pl-2 font-mono text-meta leading-relaxed text-fight">
                    DEMO MODE — this dossier will not persist. Connect Supabase first.
                  </p>
                ) : null}
              </StepBlock>
            )}
        </motion.div>

        {error ? (
          <p className="mt-3 border-l-2 border-fight pl-2 font-mono text-meta leading-relaxed text-fight">
            {error}
          </p>
        ) : null}
      </div>

      {/* ─ controls ─ */}
      <div className="flex gap-2 border-t border-edge p-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            <ChevronLeft size={14} />
            BACK
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button block onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            CONTINUE
          </Button>
        ) : (
          <Button block variant="engage" onClick={submit} disabled={submitting}>
            {submitting ? 'INDUCTING…' : 'ENTER THE FLOOR'}
            {!submitting && <Check size={14} />}
          </Button>
        )}
      </div>
    </div>
  );
}

const inputClass =
  'w-full border border-edge bg-canvas px-3 py-2.5 font-mono text-read text-phosphor outline-none placeholder:text-faint focus:border-gold';

function StepBlock({
  prompt,
  hint,
  children,
}: {
  prompt: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2 text-phosphor">{prompt}</h2>
        <p className="mt-1 font-mono text-meta leading-relaxed text-dim">
          &gt; {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-micro tracking-[0.2em] text-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

function ChipGrid({
  options,
  selected,
  onToggle,
  accent,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  accent: 'gold' | 'fight';
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={cn(
              'border px-2.5 py-1.5 font-mono text-meta tracking-[0.08em] transition-colors duration-100',
              on
                ? accent === 'fight'
                  ? 'border-fight bg-fight/15 text-fight'
                  : 'border-gold bg-gold/15 text-gold'
                : 'border-edge text-dim hover:border-edgeBright hover:text-phosphor',
            )}
          >
            {on ? '■ ' : '□ '}
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="w-20 shrink-0 font-mono text-micro tracking-[0.2em] text-dim">{k}</dt>
      <dd className="min-w-0 flex-1 break-words font-mono text-data text-phosphor">{v}</dd>
    </div>
  );
}
