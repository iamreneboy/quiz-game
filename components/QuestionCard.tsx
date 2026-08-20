import type { QuestionPublic } from '@/lib/types';
import { TIER_NAMES, CATEGORIES } from '@/lib/rank';

export default function QuestionCard({
  question, round, totalRounds,
}: { question: QuestionPublic; round: number; totalRounds: number }) {
  const cat = CATEGORIES.find(c => c.key === question.category);
  return (
    <div className="space-y-3 text-center">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
        <span>Q{round}/{totalRounds}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1">{cat?.emoji} {cat?.label}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-amber-300">{TIER_NAMES[question.tier]}</span>
      </div>
      <h2 className="text-balance text-2xl font-black sm:text-3xl">{question.prompt}</h2>
    </div>
  );
}
