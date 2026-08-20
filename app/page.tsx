'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          Circuit <span className="text-amber-400">Break</span>
        </h1>
        <p className="mt-2 text-slate-400">The office trivia grand prix</p>
      </div>

      <button
        onClick={() => router.push('/host/new')}
        className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 hover:bg-amber-300"
      >
        Host a game
      </button>

      <form
        className="flex w-full gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (code.trim().length === 5) router.push(`/room/${code.trim().toUpperCase()}`);
        }}
      >
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          placeholder="ROOM CODE"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 text-center text-lg font-bold tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 5}
          className="rounded-xl border border-slate-700 px-6 font-bold disabled:opacity-40"
        >
          Join
        </button>
      </form>
    </main>
  );
}
