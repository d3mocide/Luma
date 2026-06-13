import type { CSSProperties } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, X } from 'lucide-react'
import { SECTION_DEFS, type SectionId } from '../../lib/today-sections'

interface SortableItemProps {
  id: SectionId
  label: string
  description: string
  hidden: boolean
  onToggle: () => void
}

function SortableItem({ id, label, description, hidden, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`customize-row${hidden ? ' customize-row--hidden' : ''}`}
    >
      <button
        className="customize-drag-handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <div className="customize-row-info">
        <span className="customize-row-label">{label}</span>
        <span className="customize-row-desc">{description}</span>
      </div>

      <button
        className="customize-toggle"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        onClick={onToggle}
      >
        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

interface TodayCustomizePanelProps {
  isOpen: boolean
  onClose: () => void
  order: SectionId[]
  hidden: Set<string>
  onReorder: (newOrder: SectionId[]) => void
  onToggle: (id: string) => void
}

export function TodayCustomizePanel({
  isOpen,
  onClose,
  order,
  hidden,
  onReorder,
  onToggle,
}: TodayCustomizePanelProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      // Since the drag handle has touch-action: none, we do not need a temporal delay.
      // A small tolerance ensures tiny tremors don't trigger drag immediately.
      activationConstraint: {
        delay: 0,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as SectionId)
      const newIndex = order.indexOf(over.id as SectionId)
      onReorder(arrayMove(order, oldIndex, newIndex))
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 900,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div
        className="customize-panel"
        role="dialog"
        aria-label="Customize today screen"
      >
        {/* Header */}
        <div className="customize-panel-header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)' }}>
              Customize Today
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              Drag to reorder · tap eye to show/hide
            </div>
          </div>
          <button
            className="customize-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sortable list */}
        <div className="customize-list">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map(id => {
                const def = SECTION_DEFS.find(d => d.id === id)
                if (!def) return null
                return (
                  <SortableItem
                    key={id}
                    id={id}
                    label={def.label}
                    description={def.description}
                    hidden={hidden.has(id)}
                    onToggle={() => onToggle(id)}
                  />
                )
              })}
            </SortableContext>
          </DndContext>
        </div>

        <div className="customize-panel-footer">
          <button className="btn" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}
