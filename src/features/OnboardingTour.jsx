import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './OnboardingTour.css'

const STORAGE_KEY = 'cowart-onboarded'

const STEPS = [
  {
    icon: '✨',
    title: '文生图',
    desc: '点底部「✨ 文生图」，打一句话就能出图。',
  },
  {
    icon: '💬',
    title: '标注',
    desc: '点底部「💬 标注」工具，在图上框选区域写评审意见。',
  },
  {
    icon: '📤',
    title: '导出',
    desc: '点底部「📤 导出」，可存 PNG 或复制到剪贴板。',
  },
]

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== '1') {
      setVisible(true)
    }
  }, [])

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  const next = () => {
    if (step >= STEPS.length - 1) {
      finish()
    } else {
      setStep((s) => s + 1)
    }
  }

  const prev = () => {
    setStep((s) => Math.max(0, s - 1))
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return createPortal(
    <div className="cowart-onb-overlay" onClick={finish}>
      <div
        className="cowart-onb-card"
        role="dialog"
        aria-label="新手引导"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="cowart-onb-close" type="button" onClick={finish} title="跳过">
          ✕
        </button>

        <div className="cowart-onb-icon">{current.icon}</div>
        <div className="cowart-onb-title">{current.title}</div>
        <div className="cowart-onb-desc">{current.desc}</div>

        <div className="cowart-onb-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'dot active' : 'dot'} />
          ))}
        </div>

        <div className="cowart-onb-actions">
          <button className="cowart-onb-skip" type="button" onClick={finish}>
            跳过
          </button>
          <div className="cowart-onb-nav">
            <button
              className="cowart-onb-prev"
              type="button"
              onClick={prev}
              disabled={step === 0}
            >
              上一步
            </button>
            <button className="cowart-onb-next" type="button" onClick={next} data-primary="true">
              {isLast ? '开始使用' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
