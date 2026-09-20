'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

const WIDTH = 420;
const HEIGHT = 236;
const EASE = [0.22, 1, 0.36, 1] as const;

const INTRO_MS = 2400;
const AGENTS_INTRO_MS = 2600;
const REQUIREMENTS_MS = 1800;
const MATCHING_MS = 1500;
const CONNECT_MS = 1700;
const HOLD_MS = 3000;
const EXIT_MS = 1300;
const WAIT_MS = 3000;

const INITIAL_COUNT = 18;
const MIN_POOL = 6;
const ADD_COUNT = 4;
const MAX_POOL = 34;
const TRICKLE_MIN_MS = 3200;
const TRICKLE_MAX_MS = 5800;

const ACCENT = '#3454D1';
const MATCHED = '#3FC98A';

// Soft vignette so glyphs near the edge fade rather than clip abruptly.
const EDGE_MASK: CSSProperties = {
  maskImage: 'radial-gradient(circle at 50% 45%, black 62%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black 62%, transparent 100%)',
};

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return idCounter;
}

function randomPoint(avoid: { x: number; y: number }[], minDist: number) {
  let point = { x: 0, y: 0 };
  let attempts = 0;
  do {
    point = { x: 26 + Math.random() * (WIDTH - 52), y: 26 + Math.random() * (HEIGHT - 52) };
    attempts++;
  } while (attempts < 200 && avoid.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < minDist));
  return point;
}

// Slight, deterministic-per-pair curve so multiple lines from one company
// fan out rather than overlapping as straight spokes.
function curvedPath(x1: number, y1: number, x2: number, y2: number, bend: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = len * bend;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

type Applicant = { id: number; x: number; y: number; matched: boolean; entryDelay: number };

// The company is selective, not exhaustive: it always leaves people behind,
// and the larger the pool, the smaller a share it picks from — so a big
// applicant pool doesn't visually read as "everyone got hired."
function pickTakeCount(poolSize: number) {
  if (poolSize <= 1) return poolSize;
  const ratio = poolSize <= 6 ? 0.4 : poolSize <= 12 ? 0.3 : 0.2;
  let take = Math.max(1, Math.round(poolSize * ratio));
  take = Math.min(take, 4, poolSize - 1);
  return take;
}

function makeApplicants(count: number, avoidPoints: { x: number; y: number }[] = []) {
  const created: Applicant[] = [];
  const avoid = [...avoidPoints];
  for (let i = 0; i < count; i++) {
    const p = randomPoint(avoid, 34);
    avoid.push(p);
    created.push({ id: nextId(), x: p.x, y: p.y, matched: false, entryDelay: Math.random() * 0.22 });
  }
  return created;
}

function pickFinalists(candidateIds: number[], finalCount: number) {
  const shuffled = [...candidateIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(finalCount, candidateIds.length));
}

function PersonGlyph({
  x,
  y,
  active,
  success,
}: {
  x: number;
  y: number;
  active: boolean;
  success: boolean;
}) {
  const stroke = success ? MATCHED : '#F6F7F9';
  return (
    <motion.g
      opacity={active ? 1 : 0.4}
      animate={{ stroke }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <circle cx={x} cy={y - 5.5} r={3.2} fill="none" stroke={stroke} strokeWidth={1.5} />
      <rect x={x - 5.5} y={y - 1.5} width={11} height={8.5} rx={1.5} fill="none" stroke={stroke} strokeWidth={1.5} />
      <line x1={x - 3.4} y1={y + 1.3} x2={x + 3.4} y2={y + 1.3} stroke={stroke} strokeWidth={1} opacity={0.8} />
      <line x1={x - 3.4} y1={y + 3.6} x2={x + 1.2} y2={y + 3.6} stroke={stroke} strokeWidth={1} opacity={0.8} />
    </motion.g>
  );
}

function BuildingGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 7} y={y - 10} width={14} height={18} rx={1.5} fill="none" stroke={ACCENT} strokeWidth={1.5} />
      <line x1={x - 3.5} y1={y - 5.5} x2={x - 1.4} y2={y - 5.5} stroke={ACCENT} strokeWidth={1.2} />
      <line x1={x + 1.4} y1={y - 5.5} x2={x + 3.5} y2={y - 5.5} stroke={ACCENT} strokeWidth={1.2} />
      <line x1={x - 3.5} y1={y - 1} x2={x - 1.4} y2={y - 1} stroke={ACCENT} strokeWidth={1.2} />
      <line x1={x + 1.4} y1={y - 1} x2={x + 3.5} y2={y - 1} stroke={ACCENT} strokeWidth={1.2} />
      <line x1={x - 3.5} y1={y + 3.5} x2={x - 1.4} y2={y + 3.5} stroke={ACCENT} strokeWidth={1.2} />
      <line x1={x + 1.4} y1={y + 3.5} x2={x + 3.5} y2={y + 3.5} stroke={ACCENT} strokeWidth={1.2} />
    </g>
  );
}

type Phase =
  | 'idle'
  | 'introApplicants'
  | 'introAgents'
  | 'requirements'
  | 'matching'
  | 'connect'
  | 'hold'
  | 'exit'
  | 'waiting';

export function AuthVisual() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [company, setCompany] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [finalPicks, setFinalPicks] = useState<number[]>([]);
  const [caption, setCaption] = useState('Every applicant uploads a resume.');

  const applicantsRef = useRef(applicants);
  applicantsRef.current = applicants;
  const finalCountRef = useRef(0);

  useEffect(() => {
    setApplicants(makeApplicants(INITIAL_COUNT));
    setMounted(true);
    setPhase('introApplicants');
  }, []);

  function startRound() {
    setApplicants((prev) => {
      const unmatchedCount = prev.filter((a) => !a.matched).length;
      let pool = prev;
      if (unmatchedCount < MIN_POOL) {
        const added = makeApplicants(ADD_COUNT, prev.map((a) => ({ x: a.x, y: a.y })));
        pool = [...prev, ...added];
      }

      const freshUnmatched = pool.filter((a) => !a.matched);
      const finalCount = pickTakeCount(freshUnmatched.length);
      const candidateExtra = Math.max(1, Math.round(finalCount * 0.75));
      const candidateCount = Math.min(freshUnmatched.length, finalCount + candidateExtra);
      const shuffled = [...freshUnmatched].sort(() => Math.random() - 0.5);
      const pick = shuffled.slice(0, candidateCount).map((a) => a.id);
      finalCountRef.current = finalCount;

      const companyPos = randomPoint(pool.map((a) => ({ x: a.x, y: a.y })), 38);
      setCompany(companyPos);
      setSelected(pick);
      setFinalPicks([]);
      setCaption('Reading the role\u2019s requirements.');
      setPhase('requirements');

      return pool;
    });
  }

  useEffect(() => {
    if (!mounted || reduceMotion) return;
    let t: ReturnType<typeof setTimeout>;

    if (phase === 'introApplicants') {
      t = setTimeout(() => {
        setCaption('Our multi-agent system compares every resume against every open role.');
        setPhase('introAgents');
      }, INTRO_MS);
    } else if (phase === 'introAgents') {
      t = setTimeout(() => startRound(), AGENTS_INTRO_MS);
    } else if (phase === 'requirements') {
      t = setTimeout(() => {
        setCaption('Finding the strongest matches.');
        setPhase('matching');
      }, REQUIREMENTS_MS);
    } else if (phase === 'matching') {
      t = setTimeout(() => {
        setCaption('Matching candidates to the open role.');
        setPhase('connect');
      }, MATCHING_MS);
    } else if (phase === 'connect') {
      t = setTimeout(() => {
        setFinalPicks(pickFinalists(selected, finalCountRef.current));
        setPhase('hold');
      }, CONNECT_MS);
    } else if (phase === 'hold') {
      t = setTimeout(() => {
        setCaption('Match made — this role is filled.');
        setApplicants((prev) => prev.map((a) => (finalPicks.includes(a.id) ? { ...a, matched: true } : a)));
        setPhase('exit');
      }, HOLD_MS);
    } else if (phase === 'exit') {
      t = setTimeout(() => {
        setCompany(null);
        setSelected([]);
        setFinalPicks([]);
        const remaining = applicantsRef.current.filter((a) => !a.matched).length;
        setCaption(
          remaining > 0
            ? `${remaining} applicant${remaining === 1 ? '' : 's'} waiting for the next opening.`
            : 'A new wave of applicants joins the pool.',
        );
        setPhase('waiting');
      }, EXIT_MS);
    } else if (phase === 'waiting') {
      t = setTimeout(() => startRound(), WAIT_MS);
    }

    return () => clearTimeout(t);
  }, [mounted, reduceMotion, phase, selected, finalPicks]);

  useEffect(() => {
    if (!mounted || reduceMotion) return;
    let t: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const delay = TRICKLE_MIN_MS + Math.random() * (TRICKLE_MAX_MS - TRICKLE_MIN_MS);
      t = setTimeout(() => {
        setApplicants((prev) => {
          const unmatched = prev.filter((a) => !a.matched);
          if (unmatched.length >= MAX_POOL) return prev;
          const added = makeApplicants(1, prev.map((a) => ({ x: a.x, y: a.y })));
          return [...prev, ...added];
        });
        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return () => clearTimeout(t);
  }, [mounted, reduceMotion]);

  if (!mounted) {
    return <div className="relative w-full max-w-[480px] rounded-2xl border border-white/10 bg-white/[0.03] p-5 h-[300px]" />;
  }

  const containerClass =
    'relative w-full max-w-[480px] rounded-2xl border border-white/10 p-5 bg-[radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:14px_14px] bg-white/[0.02]';

  // Reduced motion: one calm, static frame — no timers, no looping.
  if (reduceMotion) {
    const staticApplicants = applicants.slice(0, INITIAL_COUNT);
    return (
      <div className={containerClass}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" fill="none" style={EDGE_MASK}>
          {staticApplicants.map((a) => (
            <PersonGlyph key={a.id} x={a.x} y={a.y} active={false} success={false} />
          ))}
        </svg>
        <div className="mt-4 min-h-[32px]">
          <p className="text-[12px] text-white/45 leading-relaxed">
            Matching applicants to open roles.
          </p>
        </div>
      </div>
    );
  }

  const candidateSet = new Set(selected);
  const finalSet = new Set(finalPicks);
  const companyVisible = phase === 'requirements' || phase === 'matching' || phase === 'connect' || phase === 'hold';
  const isHold = phase === 'hold';
  // Who currently shows as "connected" — the wider candidate list while
  // being evaluated, narrowing to just the finalists once the pick lands.
  const activeSet = isHold ? finalSet : candidateSet;
  const linksVisible = phase === 'connect' || phase === 'hold';
  const linkTargets = isHold ? finalPicks : selected;

  return (
    <div className={containerClass}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" fill="none" style={EDGE_MASK}>
        <AnimatePresence>
          {applicants
            .filter((a) => !a.matched)
            .map((a) => (
              <motion.g
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.6, ease: EASE, delay: a.entryDelay }}
              >
                <PersonGlyph
                  x={a.x}
                  y={a.y}
                  active={activeSet.has(a.id) && linksVisible}
                  success={finalSet.has(a.id) && isHold}
                />
              </motion.g>
            ))}
        </AnimatePresence>

        <AnimatePresence>
          {company && companyVisible && (
            <motion.g
              key="company"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <BuildingGlyph x={company.x} y={company.y} />
              {(phase === 'requirements' || phase === 'matching') && (
                <motion.circle
                  cx={company.x}
                  cy={company.y}
                  r={10}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1}
                  animate={{ opacity: [0.5, 0], scale: [1, 2.1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                />
              )}
            </motion.g>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {company &&
            linksVisible &&
            applicants
              .filter((a) => linkTargets.includes(a.id))
              .map((a, i) => (
                <motion.path
                  key={`line-${a.id}`}
                  d={curvedPath(company.x, company.y, a.x, a.y, i % 2 === 0 ? 0.12 : -0.12)}
                  fill="none"
                  stroke={isHold ? MATCHED : ACCENT}
                  strokeWidth={1.3}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.55 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1, delay: i * 0.15, ease: EASE }}
                />
              ))}
        </AnimatePresence>

        {company && isHold && (
          <g>
            {applicants
              .filter((a) => finalPicks.includes(a.id))
              .map((a) => (
                <motion.circle
                  key={`ping-${a.id}`}
                  cx={a.x}
                  cy={a.y}
                  r={3}
                  fill="none"
                  stroke={MATCHED}
                  strokeWidth={1.2}
                  initial={{ opacity: 0.7, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 3.4 }}
                  transition={{ duration: 0.9, ease: EASE }}
                />
              ))}
          </g>
        )}
      </svg>

      <div className="mt-4 min-h-[32px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, color: caption.startsWith('Match made') ? MATCHED : 'rgba(255,255,255,0.45)' }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-[12px] leading-relaxed"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}