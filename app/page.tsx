'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { FiTrash2, FiCheck, FiPlus, FiChevronDown, FiChevronUp, FiX, FiClock, FiEdit2, FiCheckCircle, FiAlertCircle, FiList, FiLoader } from 'react-icons/fi'
import { SiSlack } from 'react-icons/si'

// --- Types ---

interface Task {
  id: string
  text: string
  priority: 'Low' | 'Medium' | 'High'
  completed: boolean
  createdAt: string
}

interface ShareHistoryEntry {
  id: string
  timestamp: string
  taskCount: number
  completedCount: number
  pendingCount: number
  channel: string
}

type FilterType = 'All' | 'Pending' | 'Completed'

interface Notification {
  id: string
  type: 'success' | 'error'
  message: string
}

// --- Constants ---

const AGENT_ID = '69a03199784e34bde20926c3'

const THEME_VARS = {
  '--background': '0 0% 100%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 98%',
  '--primary': '222 47% 11%',
  '--primary-foreground': '210 40% 98%',
  '--secondary': '210 40% 96%',
  '--accent': '210 40% 92%',
  '--muted': '210 40% 94%',
  '--muted-foreground': '215 16% 47%',
  '--border': '214 32% 91%',
  '--input': '214 32% 85%',
  '--destructive': '0 84% 60%',
  '--ring': '222 47% 11%',
} as React.CSSProperties

const SAMPLE_TASKS: Task[] = [
  { id: 's1', text: 'Review Q4 financial report and prepare summary', priority: 'High', completed: false, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 's2', text: 'Schedule team standup for next sprint', priority: 'Medium', completed: true, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: 's3', text: 'Update project documentation on Confluence', priority: 'Low', completed: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 's4', text: 'Fix login page CSS bug reported by QA', priority: 'High', completed: true, createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
  { id: 's5', text: 'Send onboarding materials to new hires', priority: 'Medium', completed: false, createdAt: new Date(Date.now() - 3600000 * 5).toISOString() },
]

const SAMPLE_HISTORY: ShareHistoryEntry[] = [
  { id: 'h1', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), taskCount: 8, completedCount: 3, pendingCount: 5, channel: '#slack-test' },
  { id: 'h2', timestamp: new Date(Date.now() - 86400000).toISOString(), taskCount: 5, completedCount: 2, pendingCount: 3, channel: '#slack-test' },
]

// --- ErrorBoundary ---

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Helper: Priority Badge ---

function PriorityBadge({ priority }: { priority: 'Low' | 'Medium' | 'High' }) {
  const colors: Record<string, string> = {
    High: 'bg-red-100 text-red-700 border-red-200',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200',
    Low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[priority] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {priority}
    </span>
  )
}

// --- Helper: Notification Banner ---

function NotificationBanner({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) {
  const isSuccess = notification.type === 'success'
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm animate-in fade-in slide-in-from-top-2 ${isSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {isSuccess ? <FiCheckCircle className="h-4 w-4 flex-shrink-0" /> : <FiAlertCircle className="h-4 w-4 flex-shrink-0" />}
      <span className="flex-1">{notification.message}</span>
      <button onClick={() => onDismiss(notification.id)} className="p-0.5 rounded hover:bg-black/5 transition-colors">
        <FiX className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// --- Helper: Task Row ---

function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: Task
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, text: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(task.text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== task.text) {
      onEdit(task.id, trimmed)
    } else {
      setEditText(task.text)
    }
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setEditText(task.text)
      setIsEditing(false)
    }
  }

  return (
    <div className={`group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 hover:shadow-md ${task.completed ? 'bg-muted/40 border-border/60 opacity-70' : 'bg-white/75 backdrop-blur-[16px] border-white/20 shadow-sm'}`}>
      <button
        onClick={() => onToggle(task.id)}
        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${task.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-input hover:border-primary/50'}`}
        aria-label={task.completed ? 'Mark as pending' : 'Mark as completed'}
      >
        {task.completed && <FiCheck className="h-3 w-3" />}
      </button>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleEditKeyDown}
            className="w-full bg-transparent border-b border-primary/30 outline-none text-sm py-0.5 text-foreground"
          />
        ) : (
          <span
            onClick={() => { if (!task.completed) { setIsEditing(true) } }}
            className={`text-sm block truncate ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground hover:text-primary cursor-pointer'}`}
            title={task.completed ? task.text : 'Click to edit'}
          >
            {task.text}
          </span>
        )}
      </div>

      <PriorityBadge priority={task.priority} />

      {!isEditing && !task.completed && (
        <button
          onClick={() => setIsEditing(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-200"
          aria-label="Edit task"
        >
          <FiEdit2 className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        onClick={() => onDelete(task.id)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-200"
        aria-label="Delete task"
      >
        <FiTrash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// --- Helper: format date ---

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

// --- Main Page ---

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High'>('Medium')
  const [filter, setFilter] = useState<FilterType>('All')
  const [sending, setSending] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [shareHistory, setShareHistory] = useState<ShareHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sampleData, setSampleData] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Sample data toggle
  useEffect(() => {
    if (sampleData) {
      setTasks(SAMPLE_TASKS.map(t => ({ ...t })))
      setShareHistory(SAMPLE_HISTORY.map(h => ({ ...h })))
    } else {
      setTasks([])
      setShareHistory([])
    }
  }, [sampleData])

  // Auto-dismiss notifications after 4s
  useEffect(() => {
    if (notifications.length === 0) return
    const timers = notifications.map((n) =>
      setTimeout(() => {
        setNotifications((prev) => prev.filter((item) => item.id !== n.id))
      }, 4000)
    )
    return () => { timers.forEach(clearTimeout) }
  }, [notifications])

  // Derived data
  const completedCount = tasks.filter((t) => t.completed).length
  const pendingCount = tasks.length - completedCount
  const filteredTasks = tasks.filter((t) => {
    if (filter === 'Pending') return !t.completed
    if (filter === 'Completed') return t.completed
    return true
  })
  const hasCompletedTasks = completedCount > 0

  // Handlers
  const addNotification = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6)
    setNotifications((prev) => [...prev, { id, type, message }])
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const addTask = useCallback(() => {
    const trimmed = newTaskText.trim()
    if (!trimmed) return
    const task: Task = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      text: trimmed,
      priority: newTaskPriority,
      completed: false,
      createdAt: new Date().toISOString(),
    }
    setTasks((prev) => [task, ...prev])
    setNewTaskText('')
  }, [newTaskText, newTaskPriority])

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)))
  }, [])

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const editTask = useCallback((id: string, text: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => !t.completed))
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTask()
    }
  }, [addTask])

  const sendToSlack = useCallback(async () => {
    if (tasks.length === 0) return
    setSending(true)
    setActiveAgentId(AGENT_ID)

    try {
      // Format task list as message for the agent
      const taskLines = tasks.map((t, i) => {
        const status = t.completed ? 'COMPLETED' : 'PENDING'
        return `${i + 1}. [${status}] ${t.text} - Priority: ${t.priority}`
      })
      const message = `Please format and send the following task list to #slack-test channel:\n\nTasks:\n${taskLines.join('\n')}\n\nSummary: ${completedCount} of ${tasks.length} tasks completed`

      const result = await callAIAgent(message, AGENT_ID)

      if (result?.success) {
        const data = result?.response?.result || result?.response || result
        const responseMessage = data?.message ?? 'Tasks sent to Slack successfully'
        const channel = data?.channel ?? '#slack-test'
        const tasksSent = typeof data?.tasks_sent === 'number' ? data.tasks_sent : tasks.length
        const completedSent = typeof data?.completed_count === 'number' ? data.completed_count : completedCount
        const pendingSent = typeof data?.pending_count === 'number' ? data.pending_count : pendingCount

        addNotification('success', `${responseMessage} (${tasksSent} tasks to ${channel})`)

        const historyEntry: ShareHistoryEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          taskCount: tasksSent,
          completedCount: completedSent,
          pendingCount: pendingSent,
          channel: typeof channel === 'string' ? channel : '#slack-test',
        }
        setShareHistory((prev) => [historyEntry, ...prev].slice(0, 5))
      } else {
        const errMsg = result?.error ?? result?.response?.message ?? 'Failed to send tasks to Slack'
        addNotification('error', typeof errMsg === 'string' ? errMsg : 'Failed to send tasks to Slack')
      }
    } catch {
      addNotification('error', 'An unexpected error occurred while sending tasks to Slack')
    } finally {
      setSending(false)
      setActiveAgentId(null)
    }
  }, [tasks, completedCount, pendingCount, addNotification])

  const filters: FilterType[] = ['All', 'Pending', 'Completed']

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen bg-background text-foreground font-sans antialiased">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

          {/* Header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <FiList className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">TaskTracker</h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Sample Data Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs font-medium text-muted-foreground">Sample Data</span>
                <button
                  role="switch"
                  aria-checked={sampleData}
                  onClick={() => setSampleData((p) => !p)}
                  className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${sampleData ? 'bg-primary' : 'bg-input'}`}
                >
                  <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${sampleData ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </label>
              {/* Send to Slack */}
              <button
                onClick={sendToSlack}
                disabled={tasks.length === 0 || sending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:scale-[1.02] active:scale-[0.98]"
              >
                {sending ? (
                  <>
                    <FiLoader className="h-4 w-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <SiSlack className="h-4 w-4" />
                    <span>Send to Slack</span>
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="space-y-2">
              {notifications.map((n) => (
                <NotificationBanner key={n.id} notification={n} onDismiss={dismissNotification} />
              ))}
            </div>
          )}

          {/* Task Input Bar */}
          <div className="flex gap-2 items-center bg-white/75 backdrop-blur-[16px] border border-white/20 rounded-xl p-2 shadow-sm">
            <input
              type="text"
              placeholder="Add a new task..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground text-foreground"
            />
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as 'Low' | 'Medium' | 'High')}
              className="bg-secondary text-foreground text-xs font-medium px-3 py-2 rounded-lg border border-border outline-none cursor-pointer hover:bg-accent transition-colors"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <button
              onClick={addTask}
              disabled={!newTaskText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            >
              <FiPlus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Filters + Summary */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-secondary/60 rounded-xl p-1">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${filter === f ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            {tasks.length > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                {completedCount} of {tasks.length} tasks completed
              </span>
            )}
          </div>

          {/* Task List */}
          <div className="space-y-2 min-h-[120px]">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <FiCheckCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                {tasks.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground mb-1">No tasks yet</p>
                    <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">Add your first task above to get started. You can track priorities and share your task list to Slack.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground mb-1">No {filter.toLowerCase()} tasks</p>
                    <p className="text-xs text-muted-foreground">Try switching to a different filter.</p>
                  </>
                )}
              </div>
            ) : (
              filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onEdit={editTask}
                />
              ))
            )}
          </div>

          {/* Clear Completed */}
          {hasCompletedTasks && (
            <div className="flex justify-end">
              <button
                onClick={clearCompleted}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
              >
                <FiTrash2 className="h-3 w-3" />
                Clear {completedCount} completed
              </button>
            </div>
          )}

          {/* Share History */}
          {shareHistory.length > 0 && (
            <div className="bg-white/75 backdrop-blur-[16px] border border-white/20 rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setHistoryOpen((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FiClock className="h-4 w-4 text-muted-foreground" />
                  Share History
                  <span className="text-xs font-normal text-muted-foreground">({shareHistory.length})</span>
                </span>
                {historyOpen ? <FiChevronUp className="h-4 w-4 text-muted-foreground" /> : <FiChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {historyOpen && (
                <div className="border-t border-border px-4 py-2 space-y-0.5">
                  {shareHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-2.5 text-xs border-b border-border/40 last:border-b-0">
                      <span className="text-foreground">
                        Sent {entry.taskCount} task{entry.taskCount !== 1 ? 's' : ''} to <span className="font-medium">{entry.channel}</span>
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1.5 flex-shrink-0 ml-3">
                        <span>{entry.completedCount} done, {entry.pendingCount} pending</span>
                        <span className="text-border">|</span>
                        <span>{formatDate(entry.timestamp)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent Info */}
          <div className="bg-secondary/40 rounded-xl px-4 py-3 border border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <SiSlack className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-foreground">Slack Task Sender Agent</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">Formats and posts task lists to Slack channels</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${activeAgentId === AGENT_ID ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                <span className="text-[11px] text-muted-foreground">{activeAgentId === AGENT_ID ? 'Processing' : 'Ready'}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </ErrorBoundary>
  )
}
