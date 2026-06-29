'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'

interface BeforeAfterSliderProps {
  beforeImage: string
  afterImage: string
  beforeLabel?: string
  afterLabel?: string
  className?: string
}

const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = 'Before',
  afterLabel = 'After',
  className = '',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const getPositionFromEvent = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return 50
      const rect = containerRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const percentage = (x / rect.width) * 100
      return Math.max(0, Math.min(100, percentage))
    },
    []
  )

  const handleMove = useCallback(
    (clientX: number) => {
      if (!isDragging) return
      setSliderPosition(getPositionFromEvent(clientX))
    },
    [isDragging, getPositionFromEvent]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      setSliderPosition(getPositionFromEvent(e.clientX))
    },
    [getPositionFromEvent]
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true)
      setSliderPosition(getPositionFromEvent(e.touches[0].clientX))
    },
    [getPositionFromEvent]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX)
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      handleMove(e.touches[0].clientX)
    }
    const handleEnd = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleEnd)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleEnd)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging, handleMove])

  return (
    <div
      ref={containerRef}
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-lg select-none ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="slider"
      aria-label="Before and after comparison slider"
      aria-valuenow={Math.round(sliderPosition)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setSliderPosition((p) => Math.max(0, p - 2))
        if (e.key === 'ArrowRight') setSliderPosition((p) => Math.min(100, p + 2))
      }}
    >
      {/* After image (full width, behind) */}
      <Image
        src={afterImage}
        alt={afterLabel}
        fill
        className="object-cover pointer-events-none"
        sizes="(max-width: 768px) 100vw, 50vw"
        draggable={false}
      />

      {/* Before image (clipped to the left of the divider via clip-path so the
          image keeps full size — never squishes — and avoids fill+width which
          Next disallows) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <Image
          src={beforeImage}
          alt={beforeLabel}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          draggable={false}
        />
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] z-10"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center cursor-ew-resize">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-text-secondary"
          >
            <path
              d="M6 4L2 10L6 16M14 4L18 10L14 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div
        className="absolute top-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-20 pointer-events-none"
        style={{ opacity: sliderPosition > 10 ? 1 : 0, transition: 'opacity 0.2s' }}
      >
        {beforeLabel}
      </div>
      <div
        className="absolute top-3 right-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-20 pointer-events-none"
        style={{ opacity: sliderPosition < 90 ? 1 : 0, transition: 'opacity 0.2s' }}
      >
        {afterLabel}
      </div>

      {/* Instruction overlay (shows briefly) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-1.5 rounded-full text-xs font-medium z-20 pointer-events-none animate-pulse">
        Drag to compare
      </div>
    </div>
  )
}

export default BeforeAfterSlider
