export default function CoachRoute() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 h-full flex flex-col">
      <h1 className="text-lg font-semibold text-slate-300 mb-4">Coach</h1>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-slate-400 text-sm">AI coaching coming in Phase 2.</p>
          <p className="text-slate-600 text-xs">Trend queries · meal swaps · explanations.</p>
        </div>
      </div>
      <div className="border-t border-slate-800 pt-4">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 placeholder-slate-600 outline-none"
            placeholder="Ask Coach… (Phase 2)"
            disabled
          />
          <button className="px-4 py-3 bg-brand-500 rounded-xl text-white text-sm opacity-40 cursor-not-allowed" disabled>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
