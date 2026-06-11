export default function Home() {
  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center px-6 py-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] text-center sm:px-10">
        <div className="w-full rounded-3xl border border-slate-800/80 bg-slate-900/70 px-6 py-12 shadow-2xl shadow-black/30 sm:px-12 sm:py-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.36em] text-cyan-300/80">
            Online Tactical Card Battle
          </p>
          <h1 className="text-4xl font-bold tracking-[0.18em] text-white sm:text-6xl">
            ARCANA GRID
          </h1>
          <p className="mt-8 text-base leading-7 text-slate-300 sm:text-lg">
            現在、開発準備中です。
          </p>
        </div>
      </section>
    </main>
  );
}
