import { X, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react'

export interface ModalContent {
  title: string
  category: string
  description: string
  badge: string
  highlights: string[]
  techSpecs: { label: string; value: string }[]
  appRoute: string
}

interface FeatureModalProps {
  content: ModalContent | null
  onClose: () => void
}

export default function FeatureModal({ content, onClose }: FeatureModalProps) {
  if (!content) return null

  const handleLaunchApp = () => {
    window.location.href = `/warehouse-erp/index.html#${content.appRoute}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-up"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#0f1029]/95 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-white overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-[#6366f1]/20 blur-[80px] pointer-events-none rounded-full" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30 px-2.5 py-0.5 rounded-full">
                {content.category}
              </span>
              <span className="text-[10px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">
                ● {content.badge}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">{content.title}</h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs sm:text-sm text-white/80 leading-relaxed relative z-10">
          {content.description}
        </p>

        {/* Highlights List */}
        <div className="space-y-2 relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">
            Key Architecture Capabilities:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {content.highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-white/90 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Technical Specs Table */}
        <div className="p-4 rounded-2xl bg-[#141638] border border-white/10 space-y-2 relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">
            Technical Specification Matrix:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {content.techSpecs.map((ts, i) => (
              <div key={i} className="flex justify-between p-2 rounded-lg bg-white/5 text-[11px]">
                <span className="text-white/60">{ts.label}:</span>
                <span className="font-mono font-bold text-[#818cf8]">{ts.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions / Redirection */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10 relative z-10">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close Detail View
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleLaunchApp}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#6366f1] text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#6366f1]/25"
            >
              Open Module in ERP <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { window.location.href = '/warehouse-erp/index.html#/signup' }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-white text-gray-900 font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-white/90 transition-all shadow-lg"
            >
              Start Trial <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
