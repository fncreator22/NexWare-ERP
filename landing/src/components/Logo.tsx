/** NexWare ERP geometric logo mark — uses currentColor */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NexWare ERP"
      className={className}
    >
      {/* Warehouse / building geometric mark */}
      <path d="M 128 20 L 20 128 L 128 128 Z" />
      <path d="M 236 60 L 60 60 L 60 236 L 128 236 L 128 128 L 236 128 Z" />
      <path d="M 20 236 L 20 148 L 108 148 Z" />
    </svg>
  )
}
