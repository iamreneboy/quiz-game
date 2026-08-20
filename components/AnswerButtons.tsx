'use client';

const SHAPES = ['▲', '◆', '●', '■'];
const SHAPE_COLORS = ['#fb7185', '#38bdf8', '#facc15', '#34d399'];

export default function AnswerButtons({
  options, locked, chosen, correctIndex, onChoose,
}: {
  options: string[]; locked: boolean; chosen: number | null;
  correctIndex: number | null; onChoose: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt, i) => {
        const isChosen = chosen === i;
        const revealed = correctIndex !== null;
        const cls = revealed
          ? i === correctIndex
            ? 'border-emerald-400 bg-emerald-400/15'
            : isChosen
              ? 'border-rose-400 bg-rose-400/10 opacity-70'
              : 'border-slate-800 opacity-40'
          : isChosen
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-slate-700 bg-slate-900 hover:border-slate-500';
        return (
          <button
            key={i}
            disabled={locked || revealed}
            onClick={() => onChoose(i)}
            className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left font-semibold transition ${cls}`}
          >
            <span style={{ color: SHAPE_COLORS[i] }} aria-hidden>{SHAPES[i]}</span>
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
