import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import jsQR from 'jsqr'

type Props = {
  onScan: (address: string) => void
  onClose: () => void
}

/**
 * QR scanner with two modes:
 * 1. Live camera scanning via getUserMedia
 * 2. Upload a QR image file to decode
 * Uses jsqr for decoding — no native dependencies.
 */
export default function QrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [mode, setMode] = useState<'camera' | 'upload'>('camera')
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error' | 'no-camera'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  // Start camera
  useEffect(() => {
    if (mode !== 'camera') return
    let cancelled = false

    const start = async () => {
      setStatus('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        // Set status to scanning FIRST so the video element is visible,
        // then attach the stream. The video element is always rendered
        // in the DOM (see JSX below), so the ref is always available.
        setStatus('scanning')
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          // Wait for the video to be ready before playing
          video.onloadedmetadata = () => {
            video.play().catch(() => {})
          }
          // Fallback: try play directly in case onloadedmetadata already fired
          video.play().catch(() => {})
        }
        tick()
      } catch (err: any) {
        if (cancelled) return
        if (err?.name === 'NotAllowedError') {
          setErrorMsg('Quyền truy cập camera bị từ chối')
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          setErrorMsg('Không tìm thấy camera trên thiết bị')
        } else {
          setErrorMsg('Không mở được camera')
        }
        setStatus('no-camera')
      }
    }

    const tick = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
      if (code && code.data) {
        cleanup()
        onScan(code.data.trim())
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [mode, onScan])

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const handleFile = (file: File) => {
    setStatus('starting')
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })
      if (code && code.data) {
        onScan(code.data.trim())
      } else {
        setErrorMsg('Không đọc được mã QR từ ảnh')
        setStatus('error')
      }
    }
    img.onerror = () => {
      setErrorMsg('Không mở được ảnh')
      setStatus('error')
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] glass-strong p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">Quét mã QR</h3>
          <button
            type="button"
            onClick={() => {
              cleanup()
              onClose()
            }}
            className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 flex gap-2 rounded-2xl bg-[color:var(--surface)] p-1.5">
          <button
            type="button"
            onClick={() => setMode('camera')}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition',
              mode === 'camera' ? 'accent-gradient text-white' : 'text-[color:var(--muted)]',
            ].join(' ')}
          >
            <Camera size={15} /> Camera
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition',
              mode === 'upload' ? 'accent-gradient text-white' : 'text-[color:var(--muted)]',
            ].join(' ')}
          >
            <ImagePlus size={15} /> Tải ảnh
          </button>
        </div>

        {mode === 'camera' && (
          <div className="relative">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
              {/* Video is ALWAYS rendered so the ref is available immediately */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {/* Loading overlay on top of video */}
              {status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <Loader2 size={28} className="animate-spin text-white/70" />
                </div>
              )}
              {(status === 'no-camera' || status === 'error') && (
                <div className="absolute inset-0 flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <Camera size={32} className="text-[color:var(--muted)]" />
                  <p className="text-[12px] text-[color:var(--muted)]">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => setMode('upload')}
                    className="mt-2 rounded-xl accent-gradient px-4 py-2 text-[12px] font-semibold text-white"
                  >
                    Dùng tải ảnh thay thế
                  </button>
                </div>
              )}
              {/* Scan overlay frame */}
              {status === 'scanning' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/60" />
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {status === 'scanning' && (
              <p className="mt-2 text-center text-[11px] text-[color:var(--muted)]">
                Đưa mã QR vào khung để quét tự động
              </p>
            )}
          </div>
        )}

        {mode === 'upload' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[color:var(--border)] py-10 transition hover:border-[color:var(--accent)]"
            >
              <ImagePlus size={32} className="text-[color:var(--muted)]" />
              <span className="text-[13px] font-semibold">Chọn ảnh QR từ thiết bị</span>
              <span className="text-[11px] text-[color:var(--muted)]">PNG, JPG — hệ thống sẽ giải mã</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            {status === 'error' && errorMsg && (
              <p className="text-center text-[11.5px] text-[#ff8fa1]">{errorMsg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
