'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useDragControls, useMotionValue, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { X, Maximize2, Minimize2, Save, Download, Trash, ChevronUp, ChevronDown, Sparkles, RotateCcw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { NewsItem as SharedNewsItem } from "@cryptonewsparser/shared"; // Import shared type

// No longer need local NewsData interface

// Import the editor with SSR disabled
const Editor = dynamic(() => import('react-simple-wysiwyg').then(mod => mod.default), { ssr: false })

interface EditorModalProps {
  news: SharedNewsItem // Use shared type
  onClose: () => void
  onSave: (id: number, content: string) => void // ID is number
}

type ResizeHandlePosition =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

// Import the specific event type if available, or use a general type
// Check the 'react-simple-wysiwyg' types for the exact event name if needed.
// If not exported, using 'any' or a simplified structure might be necessary.
// Let's assume a simplified structure for now:
type ContentEditableEvent = React.SyntheticEvent<any, Event> & { target: { value: string } };

export function EditorModal({ news, onClose, onSave }: EditorModalProps) {
  // Initialize with edited_content, fallback to full_content, then description
  const initialContent = news.edited_content ?? news.full_content ?? news.description ?? '';
  const [content, setContent] = useState<string>(initialContent);
  const [commentContent, setCommentContent] = useState('') // Keep local comment state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showCommentArea, setShowCommentArea] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // For dragging
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // For resizing
  const [size, setSize] = useState({ width: 800, height: 700 }) // Default size
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<ResizeHandlePosition | null>(null)
  const resizeStartPos = useRef({ x: 0, y: 0 })
  const resizeStartSize = useRef({ width: 0, height: 0 })
  const resizeStartPosition = useRef({ x: 0, y: 0 })

  // Store pre-fullscreen state
  const preFullscreenState = useRef<{ width: number; height: number; x: number; y: number } | null>(null);

  // Center the modal on initial render
  useEffect(() => {
    if (typeof window !== 'undefined' && !isFullscreen) { // Check window exists and not fullscreen
      // Calculate initial dimensions, respecting viewport limits
      const targetWidth = 800;
      const targetHeight = 700;
      const maxWidth = window.innerWidth * 0.9; // Max 90% width
      const maxHeight = window.innerHeight * 0.85; // Max 85% height

      const initialWidth = Math.min(targetWidth, maxWidth);
      const initialHeight = Math.min(targetHeight, maxHeight);

      // Calculate centered position based on the *calculated* initial size
      const centerX = Math.max(0, (window.innerWidth - initialWidth) / 2);
      const centerY = Math.max(0, (window.innerHeight - initialHeight) / 2);

      // Set size state *and* motion values
      setSize({ width: initialWidth, height: initialHeight });
      x.set(centerX);
      y.set(centerY);
    }
    // Run only once on mount. Dependencies are intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleDragStart = (event: React.PointerEvent) => {
    // Only drag if the target is the header itself, not buttons inside it
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    dragControls.start(event)
  }

  const handleResizeStart = (e: React.MouseEvent, position: ResizeHandlePosition) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeHandle(position)
    resizeStartPos.current = { x: e.clientX, y: e.clientY }
    resizeStartSize.current = { ...size }
    resizeStartPosition.current = { x: x.get(), y: y.get() }

    const handleMouseMove = (e: MouseEvent) => {
      // Use a local variable to check isResizing state at the time of the event
      let currentIsResizing = false;
      setIsResizing(prev => {
        currentIsResizing = prev;
        return prev;
      });

      if (currentIsResizing) {
        const deltaX = e.clientX - resizeStartPos.current.x
        const deltaY = e.clientY - resizeStartPos.current.y

        let newWidth = resizeStartSize.current.width
        let newHeight = resizeStartSize.current.height
        let newX = resizeStartPosition.current.x
        let newY = resizeStartPosition.current.y

        const minWidth = 300;
        const minHeight = 200;

        if (position.includes('right')) {
          newWidth = Math.max(minWidth, resizeStartSize.current.width + deltaX)
        }
        if (position.includes('left')) {
          newWidth = Math.max(minWidth, resizeStartSize.current.width - deltaX)
          newX = resizeStartPosition.current.x + deltaX
        }
        if (position.includes('bottom')) {
          newHeight = Math.max(minHeight, resizeStartSize.current.height + deltaY)
        }
        if (position.includes('top')) {
          newHeight = Math.max(minHeight, resizeStartSize.current.height - deltaY)
          newY = resizeStartPosition.current.y + deltaY
        }

        // Prevent modal from going off-screen during resize (simple boundary check)
        const maxX = window.innerWidth - newWidth;
        const maxY = window.innerHeight - newHeight;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));


        // Only update position if width/height actually changed to prevent jitter
        if (newWidth !== size.width || newHeight !== size.height) {
          setSize({ width: newWidth, height: newHeight })
          if (position.includes('left')) x.set(newX)
          if (position.includes('top')) y.set(newY)
        }
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeHandle(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleContentChange = (event: ContentEditableEvent) => {
    setContent(event.target.value);
  };

  const handleCommentChange = (event: ContentEditableEvent) => {
    setCommentContent(event.target.value);
  };

  const handleSave = () => {
    if (news.id !== undefined) { // Ensure ID is valid
      onSave(news.id, content)
    } else {
      console.error("Cannot save: News item ID is undefined.");
      alert("Error: Cannot save changes because the item ID is missing.");
    }
  }

  const handleClear = () => {
    setContent('')
  }

  const handleReset = () => {
    // Reset to original full_content or description
    setContent(news.full_content ?? news.description ?? '');
  };


  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    // Sanitize title for filename
    const filename = (news.title || 'edited-content').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleGenerate = () => {
    // Placeholder for AI generation functionality
    console.log('Generate content (AI feature placeholder)')
    alert('AI content generation feature not yet implemented.');
  }

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      // Store current state before going fullscreen
      preFullscreenState.current = {
        width: size.width,
        height: size.height,
        x: x.get(),
        y: y.get(),
      };
      setIsFullscreen(true);
      // Let animation handle setting x, y, width, height
    } else {
      setIsFullscreen(false);
      // Restore previous state if available, otherwise recalculate center
      if (preFullscreenState.current) {
        setSize({ width: preFullscreenState.current.width, height: preFullscreenState.current.height });
        x.set(preFullscreenState.current.x);
        y.set(preFullscreenState.current.y);
      } else {
        // Fallback: Recalculate centered position (like initial centering)
        const targetWidth = 800;
        const targetHeight = 700;
        const maxWidth = window.innerWidth * 0.9;
        const maxHeight = window.innerHeight * 0.85;
        const restoredWidth = Math.min(targetWidth, maxWidth);
        const restoredHeight = Math.min(targetHeight, maxHeight);
        const centerX = Math.max(0, (window.innerWidth - restoredWidth) / 2);
        const centerY = Math.max(0, (window.innerHeight - restoredHeight) / 2);
        setSize({ width: restoredWidth, height: restoredHeight });
        x.set(centerX);
        y.set(centerY);
      }
      preFullscreenState.current = null; // Clear stored state
    }
  };

  const ResizeHandle = ({ position }: { position: ResizeHandlePosition }) => {
    const cursorMap: Record<ResizeHandlePosition, string> = {
      top: 'ns-resize',
      right: 'ew-resize',
      bottom: 'ns-resize',
      left: 'ew-resize',
      'top-left': 'nwse-resize',
      'top-right': 'nesw-resize',
      'bottom-left': 'nesw-resize',
      'bottom-right': 'nwse-resize',
    }
    const positionClasses: Record<ResizeHandlePosition, string> = {
      top: 'top-0 left-1/2 -translate-x-1/2 h-2 w-1/4 cursor-ns-resize',
      right: 'right-0 top-1/2 -translate-y-1/2 w-2 h-1/4 cursor-ew-resize',
      bottom: 'bottom-0 left-1/2 -translate-x-1/2 h-2 w-1/4 cursor-ns-resize',
      left: 'left-0 top-1/2 -translate-y-1/2 w-2 h-1/4 cursor-ew-resize',
      'top-left': 'top-0 left-0 h-3 w-3 cursor-nwse-resize',
      'top-right': 'top-0 right-0 h-3 w-3 cursor-nesw-resize',
      'bottom-left': 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize',
      'bottom-right': 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize',
    }

    return (
      <div
        className={`absolute ${positionClasses[position]} bg-blue-500/30 hover:bg-blue-500/70 rounded-full z-20`}
        style={{ cursor: cursorMap[position] }}
        onMouseDown={(e) => handleResizeStart(e, position)}
      />
    )
  }

  return (
    // Overlay - No flex centering needed here
    <motion.div
      className="fixed inset-0 bg-black/50 z-40" // Removed flex items-center justify-center
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose} // Close on overlay click
    >
      {/* Modal Content - Positioned using style prop */}
      <motion.div
        ref={modalRef}
        drag={!isFullscreen} // Enable drag only when not fullscreen
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        onPointerDown={(e) => { // More specific drag handle activation
          if ((e.target as HTMLElement).closest('.drag-handle')) {
            handleDragStart(e);
          }
        }}
        onDragStart={() => modalRef.current?.classList.add('cursor-grabbing')}
        onDragEnd={() => modalRef.current?.classList.remove('cursor-grabbing')}
        initial={{ scale: 0.9, opacity: 0 }} // Initial animation state
        animate={{ // Target animation state
          scale: 1,
          opacity: 1,
          x: isFullscreen ? 0 : x.get(),
          y: isFullscreen ? 0 : y.get(),
          width: isFullscreen ? '100vw' : size.width,
          height: isFullscreen ? '100vh' : size.height,
        }}
        style={{
          x: isFullscreen ? 0 : x,
          y: isFullscreen ? 0 : y,
          position: 'fixed',
          cursor: isFullscreen ? 'default' : 'grab',
          width: isFullscreen ? '100vw' : size.width,
          height: isFullscreen ? '100vh' : size.height,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }} // Animation physics
        exit={{ scale: 0.9, opacity: 0 }}
        className={`bg-card text-card-foreground rounded-lg shadow-xl overflow-hidden flex flex-col ${isResizing ? 'select-none' : ''} ${isFullscreen ? 'rounded-none' : 'rounded-lg'}`}
        onClick={(e) => e.stopPropagation()} // Prevent closing on modal click
      >
        {/* Header - Add a specific class for the drag handle */}
        <div
          className={`p-4 border-b flex justify-between items-center ${!isFullscreen ? 'cursor-grab drag-handle' : ''}`}
        // onPointerDown removed from here, handled by the parent motion.div check
        >
          <h2 className="text-lg font-semibold truncate pr-2" title={news.title}>{news.title || "Edit Content"}</h2>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="h-7 w-7">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-auto p-4 border rounded-md bg-muted/20">
          <Editor
            value={content}
            onChange={handleContentChange}
            containerProps={{
              style: {
                height: '100%', // Fill parent
                minHeight: '300px', // Ensure minimum height
                fontSize: '14px',
                outline: 'none', // Remove default outline
              },
            }}
          />
        </div>

        {/* Comment Area (Collapsible) */}
        <AnimatePresence>
          {showCommentArea && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: '1rem' }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden px-4" // Added padding
            >
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">Notes / Comments:</h4>
              <div className="border rounded-md overflow-hidden">
                <Editor
                  value={commentContent}
                  onChange={handleCommentChange}
                  containerProps={{
                    style: {
                      height: '150px', // Fixed height for comment area
                      fontSize: '13px',
                      outline: 'none',
                    },
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="p-4 border-t flex flex-wrap justify-between items-center gap-2"> {/* Added flex-wrap and gap */}
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCommentArea(!showCommentArea)}
              className="flex items-center"
              aria-expanded={showCommentArea} // Accessibility
            >
              {showCommentArea ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide Notes
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show Notes
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="flex items-center text-muted-foreground hover:text-destructive"
              title="Reset to original content"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="flex items-center text-muted-foreground hover:text-destructive"
              title="Clear editor content"
            >
              <Trash className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex items-center"
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              className="flex items-center"
              disabled // Disable AI button for now
              title="AI Generate (Coming Soon)"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Generate
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              className="flex items-center"
              disabled={!news.id} // Disable save if ID is missing
            >
              <Save className="h-4 w-4 mr-1" />
              Save Changes
            </Button>
          </div>
        </div>

        {/* Resize Handles (only if not fullscreen) */}
        {!isFullscreen && (
          <>
            <ResizeHandle position="top" />
            <ResizeHandle position="right" />
            <ResizeHandle position="bottom" />
            <ResizeHandle position="left" />
            <ResizeHandle position="top-left" />
            <ResizeHandle position="top-right" />
            <ResizeHandle position="bottom-left" />
            <ResizeHandle position="bottom-right" />
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
