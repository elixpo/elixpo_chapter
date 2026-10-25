"use client"

import useSketchStore, { TOOLS } from '../../store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { ArrowheadControls } from './ArrowheadPicker'
import { OpacityControl } from './AppearanceControls'
import { useState, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { getStrokeSwatches, getThemeInk } from '../../../utils/themeColors.js'

function ColorGrid({ colors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {colors.map((c) => (
        <button key={c} onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-md border-[1.5px] transition-all duration-100 ${selected === c ? 'border-accent scale-110' : 'border-white/[0.08] hover:border-white/20'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export default function ArrowSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const resolvedTheme = 'dark'
  const [strokeColor, setStrokeColor] = useState(null)
  const displayedStrokeColor = strokeColor ?? getThemeInk(resolvedTheme)
  const [thickness, setThickness] = useState(2)
  const [outlineStyle, setOutlineStyle] = useState('solid')
  const [arrowType, setArrowType] = useState('straight')
  const [curvature, setCurvature] = useState(20)

  // Bridge helpers: update React state + engine state + selected arrow
  const updateStroke = useCallback((v) => {
    setStrokeColor(v)
    if (window.arrowToolSettings) window.arrowToolSettings.strokeColor = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ stroke: v })
  }, [])

  const updateThickness = useCallback((v) => {
    setThickness(v)
    if (window.arrowToolSettings) window.arrowToolSettings.strokeWidth = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ strokeWidth: v })
  }, [])

  const updateOutline = useCallback((v) => {
    setOutlineStyle(v)
    if (window.arrowToolSettings) window.arrowToolSettings.outlineStyle = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowOutlineStyle: v })
  }, [])

  const updateType = useCallback((v) => {
    setArrowType(v)
    if (window.arrowToolSettings) window.arrowToolSettings.arrowCurved = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowCurved: v })
  }, [])

  const updateCurvature = useCallback((v) => {
    setCurvature(v)
    if (window.arrowToolSettings) window.arrowToolSettings.curveAmount = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowCurveAmount: v })
  }, [])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.ARROW || selectedShapeSidebar === 'arrow'}>
      {/* Start / end arrowheads (Excalidraw) */}
      <ArrowheadControls />

      <Divider />

      <ToolbarButton tooltip={t('sidebar.strokeColor')}
        preview={<span className="w-4 h-4 rounded-md border border-white/20" style={{ backgroundColor: displayedStrokeColor }} />}
      >
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.stroke')}</p>
        <ColorGrid colors={getStrokeSwatches(resolvedTheme)} selected={displayedStrokeColor} onSelect={updateStroke} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-edit-alt" tooltip={t('sidebar.strokeWidth')}>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.width')}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 7].map((w) => (
            <button key={w} onClick={() => updateThickness(w)}
              className={`w-9 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${thickness === w ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-white/[0.06]'}`}
            >
              <div className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w) }} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-minus-circle" tooltip="Stroke style">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.style')}</p>
        <div className="flex items-center gap-1">
          {[{ v: 'solid', d: '' }, { v: 'dashed', d: '6 4' }, { v: 'dotted', d: '2 3' }].map((s) => (
            <button key={s.v} onClick={() => updateOutline(s.v)}
              className={`w-11 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${outlineStyle === s.v ? 'bg-accent/15' : 'hover:bg-white/[0.06]'}`}
            >
              <svg width="28" height="4" viewBox="0 0 28 4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" strokeWidth="2" strokeDasharray={s.d} strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      {/* Arrow type */}
      <ToolbarButton icon="bxs-share-alt" tooltip="Arrow type">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.type')}</p>
        <div className="flex flex-col gap-0.5">
          {[
            { v: 'straight', i: 'bxs-right-arrow-alt', l: 'Straight' },
            { v: 'curved', i: 'bxs-analyse', l: 'Curved' },
            { v: 'elbow', i: 'bxs-network-chart', l: 'Elbow' },
          ].map((a) => (
            <button key={a.v} onClick={() => updateType(a.v)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${arrowType === a.v ? 'bg-accent text-white' : 'text-text-secondary hover:bg-white/[0.06]'}`}
            >
              <i className={`bx ${a.i} text-sm`} /> {a.l}
            </button>
          ))}
          {arrowType === 'curved' && (
            <>
              <div className="w-full h-px bg-white/[0.08] my-1" />
              <p className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Curvature</p>
              <div className="flex items-center gap-1">
                {[{ v: 8, l: 'Lo' }, { v: 20, l: 'Md' }, { v: 40, l: 'Hi' }].map((c) => (
                  <button key={c.v} onClick={() => updateCurvature(c.v)}
                    className={`flex-1 py-1 rounded-md text-xs text-center transition-all duration-100 ${curvature === c.v ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-white/[0.06]'}`}
                  >{c.l}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </ToolbarButton>
      <Divider />
      <OpacityControl />
      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
