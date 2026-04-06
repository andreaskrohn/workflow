'use client'
import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Project } from '@/lib/db/repositories/projectRepository'
import { ProjectSwitcher } from '@/components/graph/ProjectSwitcher'

const WorkflowGraph = dynamic(
  () => import('@/components/graph/WorkflowGraph').then((m) => m.WorkflowGraph),
  { ssr: false, loading: () => <p className="text-slate-400 p-6">Loading graph…</p> },
)

export default function GraphPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [selected, setSelected] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((list: Project[]) => {
        setProjects(list)
        if (list.length > 0) setSelected(list[0])
      })
      .catch(() => setError('Failed to load projects.'))
  }, [])

  if (error) return <p className="text-red-400 p-6">{error}</p>
  if (!projects) return <p className="text-slate-400 p-6">Loading…</p>

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...(prev ?? []), project])
    setSelected(project)
  }

  return (
    <div className="h-full w-full -m-6 flex flex-col">
      <ProjectSwitcher
        projects={projects}
        selected={selected}
        onSelect={setSelected}
        onProjectCreated={handleProjectCreated}
      />
      {selected ? (
        <div className="flex-1 min-h-0">
          <WorkflowGraph key={selected.id} projectId={selected.id} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-sm">No projects found. Create one using the Project dropdown above.</p>
        </div>
      )}
    </div>
  )
}
