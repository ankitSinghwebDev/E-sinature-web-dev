import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button, Space, Typography } from 'antd'
import { ClearOutlined, EditOutlined } from '@ant-design/icons'

const { Text } = Typography

const SignaturePad = forwardRef(({
  height = 180,
  onSignChange,
  title = 'Signature',
  placeholder = 'Draw your signature here',
  showHeaderClear = true,
}, ref) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      if (!hasSignature) return null
      return canvasRef.current?.toDataURL('image/png')
    },
    isEmpty: () => !hasSignature,
    clear: () => clearCanvas(),
  }))

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onSignChange?.(false)
  }, [onSignChange])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = height
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
  }, [height])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    const ctx = getCtx()
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = getCtx()
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasSignature) {
      setHasSignature(true)
      onSignChange?.(true)
    }
  }

  const stopDrawing = () => {
    if (isDrawing && hasSignature) {
      // Notify parent with latest state on pen lift so data URL can be captured
      onSignChange?.(true)
    }
    setIsDrawing(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Space size={6}>
          <EditOutlined className="text-slate-400" />
          <Text strong className="text-sm text-slate-700">{title}</Text>
        </Space>
        {showHeaderClear && hasSignature && (
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={clearCanvas}
            className="text-xs text-slate-500 hover:text-red-500"
          >
            Clear
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        className="relative rounded-xl border-2 border-dashed overflow-hidden transition-colors w-full"
        style={{
          borderColor: hasSignature ? '#a5b4fc' : '#e2e8f0',
          background: hasSignature ? '#fafbff' : '#f8fafc',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ cursor: 'crosshair', display: 'block', touchAction: 'none', width: '100%' }}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Text type="secondary" className="text-sm">{placeholder}</Text>
          </div>
        )}
      </div>
    </div>
  )
})

SignaturePad.displayName = 'SignaturePad'

export default SignaturePad
