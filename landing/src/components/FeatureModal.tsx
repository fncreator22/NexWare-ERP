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
        className="relative w-full max-w-2xl bg-[#12151c] border border-white/10 rounded-lg p-6 sm:p-8 shadow-2xl space-y-6 text-white overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30 px-2.5 py-0.5 rounded-md">
                {content.category}
              </span>
              <span className="text-[10px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded-md">
                ● {content.badge}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{content.title}</h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors"
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
              <div key={i} className="flex items-center gap-2 text-xs text-white/90 p-2.5 rounded-lg bg-[#0d0f14] border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Technical Specs Table */}
        <div className="p-4 rounded-lg bg-[#0d0f14] border border-white/10 space-y-2 relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 font-mono">
            Technical Specification Matrix:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {content.techSpecs.map((ts, i) => (
              <div key={i} className="flex justify-between p-2 rounded-md bg-white/5 text-[11px]">
                <span className="text-white/60">{ts.label}:</span>
                <span className="font-mono font-bold text-[#f59e0b]">{ts.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions / Redirection */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10 relative z-10">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close Detail View
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleLaunchApp}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#f59e0b] text-[#08090c] font-bold text-xs px-5 py-2.5 rounded-lg hover:bg-[#d97706] transition-all shadow-lg shadow-[#f59e0b]/20"
            >
              Open Module in ERP <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { window.location.href = '/warehouse-erp/index.html#/signup' }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-white text-[#08090c] font-bold text-xs px-5 py-2.5 rounded-lg hover:bg-white/90 transition-all shadow-lg"
            >
              Start Trial <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
