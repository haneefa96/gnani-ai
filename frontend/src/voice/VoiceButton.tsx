import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface VoiceButtonProps {
  onStateChange?: (isRecording: boolean) => void
  isRecording: boolean
  label?: string
  onEnd?: (audioBlob: Blob) => void
}

export function VoiceButton({
  onStateChange,
  isRecording,
  label = 'Record Entry',
  onEnd,
}: VoiceButtonProps) {
  const [isHeld, setIsHeld] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const timerRef = useRef<NodeJS.Timeout>()
  const audioChunksRef = useRef<Blob[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    onStateChange?.(isRecording)
  }, [isRecording, onStateChange])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        onEnd?.(audioBlob)
        setIsHeld(false)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsHeld(true)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Microphone access denied or not available')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isHeld) {
      mediaRecorderRef.current.stop()
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      setRecordingTime(0)
    }
  }

  const handleMouseDown = () => {
    startRecording()
  }

  const handleMouseUp = () => {
    stopRecording()
  }

  const handleMouseLeave = () => {
    stopRecording()
  }

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      disabled={isRecording}
      className={`
        relative flex items-center justify-center
        w-24 h-24 rounded-full shadow-lg transition-all duration-200
        ${isHeld ? 'bg-red-600 scale-110' : 'bg-blue-600 hover:bg-blue-700'}
        focus:outline-none focus:ring-4 focus:ring-blue-300
      `}
      aria-label={label}
    >
      {/* Microphone icon */}
      <svg
        className={`w-8 h-8 text-white transition-transform duration-300 ${
          isHeld ? 'animate-pulse' : ''
        }`}
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>

      {/* Recording timer */}
      {isHeld && (
        <span className="absolute -bottom-8 text-white text-sm font-medium">
          {recordingTime}s
        </span>
      )}

      {/* Label */}
      <span className="absolute -bottom-8 text-white text-sm font-medium mt-6">
        {label}
      </span>
    </button>
  )
}

export default VoiceButton
