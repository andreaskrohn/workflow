import dynamic from 'next/dynamic'

// WorkflowGraph uses reactflow (browser-only APIs) — disable SSR.
const WorkflowGraph = dynamic(
  () => import('@/components/graph/WorkflowGraph').then((m) => m.WorkflowGraph),
  { ssr: false, loading: () => <p className="text-slate-400 p-6">Loading graph…</p> },
)

export default function GraphPage() {
  return (
    <div className="h-full w-full -m-6">
      <WorkflowGraph />
    </div>
  )
}
