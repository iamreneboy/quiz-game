import type { QuestionPublic, RevealPayload } from '@/lib/types';

export default function RevealPanel({ reveal, question }: { reveal: RevealPayload; question: QuestionPublic }) {
  const total = reveal.counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-emerald-400">Correct answer</p>
      <p className="text-center text-2xl font-black">{question.options[reveal.correct_index]}</p>

      <div className="space-y-2">
        {question.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-28 truncate text-slate-400 sm:w-40">{opt}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
              <div
                className={i === reveal.correct_index ? 'h-full bg-emerald-400' : 'h-full bg-slate-600'}
                style={{ width: `${(reveal.counts[i] / total) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right tabular-nums">{reveal.counts[i]}</span>
          </div>
        ))}
      </div>

      {reveal.fastest && (
        <p className="text-center font-bold text-amber-300">⚡ Fastest: {reveal.fastest.nickname}</p>
      )}
      {reveal.fun_fact && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-center text-slate-300">
          💡 {reveal.fun_fact}
        </div>
      )}
    </div>
  );
}
