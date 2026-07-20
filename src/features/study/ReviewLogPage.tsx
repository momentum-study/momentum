import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { useData } from '../../app/providers'
import { db } from '../../db/app-db'
import { cn } from '../../lib/utils'
import { useUndo } from '../../lib/use-undo'
import { RATING_LABELS } from '../../lib/fsrs-scheduler'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Link } from 'react-router-dom'
import type { StudyReview } from '../../domain/types'

export default function ReviewLogPage() {
  const { data, loadData } = useData()
  const { push: pushUndo } = useUndo()
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const activeAreas = useMemo(
    () => data.studyAreas.filter((a) => !a.deletedAt),
    [data.studyAreas]
  )


  const reviewsByArea = useMemo(() => {
    const groups: Record<string, StudyReview[]> = {}
    data.studyReviews.forEach((r) => {
      if (!groups[r.areaId]) groups[r.areaId] = []
      groups[r.areaId].push(r)
    })
    // Sort each group by date descending
    Object.values(groups).forEach((reviews) =>
      reviews.sort((a, b) => parseISO(b.reviewedAt).getTime() - parseISO(a.reviewedAt).getTime())
    )
    return groups
  }, [data.studyReviews])

  const selectedReviews = selectedAreaId ? (reviewsByArea[selectedAreaId] || []) : []
  const selectedArea = activeAreas.find((a) => a.id === selectedAreaId)

  async function handleDeleteReview(review: StudyReview) {
    await db.studyReviews.delete(review.id)
    pushUndo({
      description: `Deleted review log`,
      undo: async () => { await db.studyReviews.add(review); await loadData() },
      redo: async () => { await db.studyReviews.delete(review.id); await loadData() },
    })
    await loadData()
    setDeleteConfirm(null)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Review History</h1>
          <p className="text-slate-600 dark:text-slate-400">Past study reviews and confidence ratings</p>
        </div>
        <Link to="/study">
          <Button variant="secondary">← Back</Button>
        </Link>
      </div>

      {activeAreas.length === 0 ? (
        <EmptyState
          title="No study areas yet"
          description="Create study areas first, then review them to build your history."
          action={
            <Link to="/study">
              <Button>Go to Study Areas</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Area list */}
          <div className="md:col-span-1 space-y-2">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Areas</h2>
            {activeAreas.map((area) => {
              const reviewCount = reviewsByArea[area.id]?.length || 0
              return (
                <button
                  key={area.id}
                  onClick={() => setSelectedAreaId(area.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-colors',
                    selectedAreaId === area.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                >
                  <div className="font-medium text-sm">{area.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {reviewCount} review{reviewCount === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Review list */}
          <div className="md:col-span-2">
            {!selectedAreaId ? (
              <EmptyState
                title="Select an area"
                description="Choose a study area from the left to see its review history."
              />
            ) : selectedReviews.length === 0 ? (
              <EmptyState
                title="No reviews yet"
                description={`"${selectedArea?.name}" hasn't been reviewed yet.`}
              />
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                  {selectedArea?.name}: {selectedReviews.length} reviews
                </h2>
                {selectedReviews.map((review) => {
                  const ratingLabel = RATING_LABELS[review.rating - 1]
                  return (
                    <Card key={review.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'px-2 py-0.5 text-xs text-white rounded',
                              ratingLabel.color
                            )}>
                              {ratingLabel.label}
                            </span>
                            <span className="text-sm text-slate-500">
                              {format(parseISO(review.reviewedAt), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="text-sm mt-2">
                            {review.minutesSpent} min{review.notes ? `. ${review.notes}` : ''}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setDeleteConfirm(review.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Review">
        <p className="mb-4">Are you sure you want to delete this review log?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              const review = data.studyReviews.find((r) => r.id === deleteConfirm)
              if (review) handleDeleteReview(review)
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}