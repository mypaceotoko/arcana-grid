import { notFound } from "next/navigation";

import { getSupabaseDebugView } from "./view";

export const dynamic = "force-dynamic";

const isDebugPageEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG_PAGES === "true";

const yesNo = (value: boolean): string => (value ? "yes" : "no");

export default function SupabaseDebugPage() {
  if (!isDebugPageEnabled()) {
    notFound();
  }

  const view = getSupabaseDebugView();

  return (
    <main className="min-h-dvh bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl shadow-black/30">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.36em] text-cyan-300/80">
          Debug
        </p>
        <h1 className="text-2xl font-bold tracking-wide text-white">
          Supabase 接続状態
        </h1>

        <dl className="mt-6 space-y-3 text-sm">
          {view.rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3"
            >
              <dt className="text-slate-300">{row.label}</dt>
              <dd
                className={
                  row.value
                    ? "font-semibold text-emerald-400"
                    : "font-semibold text-rose-400"
                }
              >
                {yesNo(row.value)}
              </dd>
            </div>
          ))}
        </dl>

        {view.unconfiguredMessage ? (
          <p className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {view.unconfiguredMessage}
          </p>
        ) : null}

        <p className="mt-6 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-xs leading-6 text-slate-400">
          ⚠️ {view.serviceRoleNotice}
        </p>

        <p className="mt-4 text-xs text-slate-500">
          サーバー側の接続確認は{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
            /api/debug/supabase/health
          </code>{" "}
          を参照してください。
        </p>
      </div>
    </main>
  );
}
