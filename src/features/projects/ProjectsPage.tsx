import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { v4 as uuid } from 'uuid'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { isoNow } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageSpinner } from '../../components/ui/Spinner'
import type { Project } from '../../domain/types'

interface ProjectFormData {
  name: string
  subjectId: string
  description: string
  goalMinutes: number
  dueDate: string
}

const emptyFormData: ProjectFormData = {
  name: '',
  subjectId: '',
  description: '',
  goalMinutes: 60,
  dueDate: '',
}

export default function ProjectsPage() {
  const { data, isLoading, loadData } = useData()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deleteProject, setDeleteProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState<ProjectFormData>(emptyFormData)
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenModal = (project?: Project) => {
    if (project) {
      setEditingProject(project)
      setFormData({
        name: project.name,
        subjectId: project.subjectId,
        description: project.description || '',
        goalMinutes: project.goalMinutes || 60,
        dueDate: project.dueDate ?? '',
      })
    } else {
      setEditingProject(null)
      setFormData({
        ...emptyFormData,
        subjectId: data.subjects[0]?.id || '',
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProject(null)
    setFormData(emptyFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.subjectId) return
    setIsSaving(true)
    try {
      const now = isoNow()
      const dueDate = formData.dueDate || undefined
      if (editingProject) {
        await db.projects.update(editingProject.id, {
          name: formData.name.trim(),
          subjectId: formData.subjectId,
          description: formData.description.trim() || undefined,
          goalMinutes: formData.goalMinutes,
          dueDate,
          updatedAt: now,
        })
      } else {
        const newProject: Project = {
          id: uuid(),
          name: formData.name.trim(),
          subjectId: formData.subjectId,
          description: formData.description.trim() || undefined,
          goalMinutes: formData.goalMinutes,
          dueDate,
          createdAt: now,
          updatedAt: now,
        }
        await db.projects.add(newProject)
      }
      await loadData()
      handleCloseModal()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteProject) return
    setIsSaving(true)
    try {
      await db.projects.delete(deleteProject.id)
      await loadData()
      setDeleteProject(null)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Projects</h2>
        <Button variant="primary" size="sm" onClick={() => handleOpenModal()}>
          Add Project
        </Button>
      </div>

      {data.projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Add a project to track your study goals."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((project) => {
            const subject = data.subjects.find((s) => s.id === project.subjectId)
            return (
              <Card key={project.id}>
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {project.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{subject?.name ?? 'No focus area'}</div>
                    </div>
                    <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenModal(project)}
                        className="px-2 py-1"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteProject(project)}
                        className="px-2 py-1"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {project.description && (
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {project.description}
                    </div>
                  )}
                  {project.goalMinutes !== undefined && project.goalMinutes > 0 && (
                    <div className="mt-2 text-sm text-slate-500">
                      Goal: {project.goalMinutes} min
                    </div>
                  )}
                  {project.dueDate && (
                    <div className="mt-2 text-sm text-slate-500">
                      Deadline: {format(parseISO(project.dueDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editingProject ? 'Edit Project' : 'Add Project'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="input"
              placeholder="Enter project name"
              required
            />
          </div>
          <div>
            <label className="label">Focus Area</label>
            <select
              value={formData.subjectId}
              onChange={(e) => setFormData((prev) => ({ ...prev, subjectId: e.target.value }))}
              className="input"
              required
            >
              <option value="">Select a focus area</option>
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="input min-h-[80px] resize-y"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="label">Deadline Date (optional)</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Goal Minutes</label>
            <input
              type="number"
              value={formData.goalMinutes}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  goalMinutes: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="input"
              min="0"
              placeholder="Target minutes"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingProject ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteProject}
        onClose={() => setDeleteProject(null)}
        title="Delete Project"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {deleteProject?.name}
            </span>
            ? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteProject(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isSaving}>
              {isSaving ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}