import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, ChevronDown, ChevronUp, ChevronRight, Activity, PanelLeftClose, PanelLeftOpen, CornerUpLeft, CornerUpRight, Save, Plus, Minus, Trash2, Download, Mail, Terminal, Map as MapIcon } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { VehicleInspectTooltip, TrafficFlowRates, BadgeView, CollapsibleSection, PhaseLogList, LevelCompleteModal, MasterSwitch, CrashModal } from './UI';
import { AnalyticalChart, QueueChart } from './Charts';
import { Histogram, ManualOverlay, LevelSelect, GameIntro, FirmwareUpdatePrompt } from './CoreComponents';
import { level1Briefing } from './types';
import { MobileEditor } from './MobileEditor';
import { useTrafficSimulation } from './useTrafficSimulation';
import { hapticHeavy, hapticCrash, hapticError, playThunk, startAtmosphericHum, stopAtmosphericHum, getMovementIcon, MovementLabels, getDirection, DIRECTIONS, TIME_SCALE_OPTIONS } from './traffic';
import { LANES, CANVAS_SIZE, MAX_TOTAL_LOOP_SECONDS, DEFAULT_PHASE_GREEN_SECONDS, MIN_PHASE_GREEN_SECONDS, INTERSECTION_SIZE, STOP_LINE, LANE_WIDTH, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from './constants';

export default function App() {
  const {
    unlockedLevels, unlockLevel, saveSolution, saveHighscore,
    canvasRef, simMainRef, mobileSplitHostRef, inspectPaintRef, inspectPanel, setInspectPanel,
    isPlaying, setIsPlaying, isPlayingRef, phaseTimings, setPhaseTimings, trafficRates, setTrafficRates,
    offScreenQueues, setOffScreenQueues, isAdaptive, setIsAdaptive,
    introPhase, setIntroPhase, mobileScreen, setMobileScreen, mobileScreenRef,
    isMobilePortrait, setIsMobilePortrait, executionSplitActive, setExecutionSplitActive,
    isFreeplay, setIsFreeplay, sessionCarsCleared, setSessionCarsCleared, sessionCarsByDir, setSessionCarsByDir,
    sessionCrashes, setSessionCrashes, sessionStartTime, setSessionStartTime, sessionTime, setSessionTime,
    activeLevelId, setActiveLevelId, currentLevel, editorRef, decorationsRef, handleEditorDidMount,
    sidebarCollapsed, setSidebarCollapsed, sidebarWidth, setSidebarWidth, isResizingSidebar, setIsResizingSidebar,
    mobileSplitHeight, setMobileSplitHeight, mobileMinSplitPct, setMobileMinSplitPct,
    isDraggingMobileSplitRef, resizeStartXRef, resizeStartWidthRef, collapsed, setCollapsed,
    timingHistory, setTimingHistory, queueHistory, setQueueHistory,
    wiringPhaseIndex, setWiringPhaseIndex, currentPhase, setCurrentPhase,
    lightState, setLightState, timer, setTimer, logs, setLogs,
    zoom, setZoom, pan, setPan, isDraggingCanvasRef, dragStartCanvasRef, panStartRef, hasDraggedRef,
    activePointersRef, pinchStartDistRef, pinchStartZoomRef, timeScale, setTimeScale, timeScaleRef,
    showHeatmap, setShowHeatmap, loopLastMs, setLoopLastMs, loopAvg10Ms, setLoopAvg10Ms, crashInfo, setCrashInfo,
    isCrashModalMinimized, setIsCrashModalMinimized, levelCompleteInfo, setLevelCompleteInfo,
    isOptimizing, setIsOptimizing, toasts, addToast,
    isManualOpen, setIsManualOpen, installDeferred, setInstallDeferred, isStandaloneDisplay, setIsStandaloneDisplay,
    cycleDemandRef, skipConditionalAfterInjectRef, cycleCounterRef,
    programCode, setProgramCode, compiledPhases, setCompiledPhases, compiledRules, setCompiledRules,
    injectedPhase, setInjectedPhase, programError, setProgramError, isEditMode, setIsEditMode,
    userTemplate, setUserTemplate, cmdDir, setCmdDir, cmdTurn, setCmdTurn,
    appendCommand, appendPhase, deleteLastLine, saveUserTemplate, compile,
    vehiclesRef, forceRareSpawnRef, forceLegendarySpawnRef, laneCarsCacheRef, skidMarksRef,
    previousRearTiresRef, requestRef, lastTimeRef, crashDetectedRef, loopUpdateSectionsRef,
    loopDrawSectionsRef, loopTotalMsWindowRef, loopHudThrottleRef, bgFontsReady, setBgFontsReady,
    heatMapRef, addLog, resetSimulation, handleSelectLevel, applyTemplate, detectCrash,
    yieldMovements, activeMovements, update, draw, loop, triggerRedraw, handlePhaseTimingChange,
    getPercentage, toggleCollapsed, togglePlayback, dismissIntroSplash, enterGameFromIntro, returnToMainMenu,
    handleCanvasWheel, handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp, startSidebarResize,
    phaseRowCount, cycleLength, sidebarColumnWidth, engineeringTemplateBlurb
  } = useTrafficSimulation();

  if (introPhase !== null) {

    return (
      <GameIntro
        phase={introPhase}
        onDismissSplash={dismissIntroSplash}
        onEnterGame={enterGameFromIntro}
      />
    );
  }

  const atMobileBottomMin =
    mobileScreen !== 'briefing' &&
    (mobileScreen === 'metrics' || mobileScreen === 'logic') &&
    mobileSplitHeight <= mobileMinSplitPct + 1.5;

  const lastQueueEntry = queueHistory[queueHistory.length - 1];
  const totalCongestion = lastQueueEntry ? LANES.reduce((sum, lane) => sum + (lastQueueEntry[lane.id] as number || 0), 0) : 0;

  if (isMobilePortrait) {
    return (
      <div className="h-[100dvh] w-full flex flex-col bg-[#0D0F12] overflow-hidden border-2 border-[#2D333B] relative crt-bezel">
        {/* Technical Overlays */}
        <div className="pointer-events-none absolute top-14 left-4 font-mono text-[8px] text-[#8B949E] flex flex-col gap-0.5 opacity-30 z-0">
          <div>SYS_TEMP: 42.4°C</div>
          <div>NET_LINK: OK</div>
        </div>
        <div className="pointer-events-none absolute top-14 right-4 font-mono text-[8px] text-[#8B949E] text-right opacity-30 z-0">
          <div>v4.2.0-STABLE</div>
          <div>52.34N 13.40E</div>
        </div>
        
        <header className="shrink-0 bg-[#1A1D23] border-b-2 border-[#2D333B] px-3 py-2 flex items-center justify-between z-10 shadow-md gap-2">
          <div className="flex items-center gap-2 font-mono font-bold tracking-wider text-[11px] min-w-0">
            <span className="text-[#3FB950] shrink-0 animate-pulse">●</span>
            <span className="text-[#C9D1D9] truncate">TRAFFIC_SEC_082</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsManualOpen(true)}
              className="rounded border border-[#2D333B] px-2 py-1 text-[9px] font-mono font-bold text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#3FB950] transition-colors"
            >
              MANUAL
            </button>
            <button
              type="button"
              onClick={returnToMainMenu}
              className="rounded border border-[#2D333B] px-2 py-1 text-[9px] font-mono font-bold text-[#8B949E] hover:border-[#F85149]/50 hover:text-[#F85149] transition-colors"
            >
              MENU
            </button>
            <div className="font-mono text-[10px] text-[#C9D1D9] text-right">
              {isPlaying ? 'ACTIVE' : 'PAUSED'} | CYCLE: {cycleLength}s
            </div>
          </div>
        </header>

        <div ref={mobileSplitHostRef} className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 z-30 transition-opacity duration-300 ${mobileScreen === 'briefing' ? 'opacity-100 bg-[#0D0F12]' : 'opacity-0 pointer-events-none'}`}>
            <LevelSelect 
              levels={level1Briefing} 
              activeLevelId={activeLevelId} 
              unlockedLevels={unlockedLevels}
              onSelectLevel={(idx) => {
                handleSelectLevel(idx);
              }} 
            />
          </div>

          <main 
            ref={simMainRef}
            className={`absolute left-0 top-0 w-full h-full transition-all duration-500 ease-in-out flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]
              ${mobileScreen !== 'briefing' ? 'border-b-2 border-[#2D333B] z-10' : 'z-0 opacity-0 pointer-events-none'}
            `}
          >
            <div className="absolute top-2 left-0 w-full px-2 z-20 flex justify-between items-start pointer-events-none">
              <div className="flex gap-2 pointer-events-auto items-center">
                <MasterSwitch isOn={isPlaying} onToggle={togglePlayback} />
                {TIME_SCALE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTimeScale(s)}
                    className={`min-w-[2rem] py-1 px-1 rounded-none text-[10px] font-mono font-bold border transition-all shadow-xl ${
                      timeScale === s
                        ? 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950]'
                        : 'border-[#2D333B] bg-[#1A1D23] text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#C9D1D9]'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
            <canvas 
              ref={canvasRef} 
              width={CANVAS_SIZE} 
              height={CANVAS_SIZE}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onWheel={handleCanvasWheel}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: isDraggingCanvasRef.current ? 'none' : 'transform 0.15s ease-out' }}
              className="box-border max-h-[min(90vw,100%)] max-w-[min(90vw,100%)] aspect-square w-full rounded-none border border-[#2D333B] shadow-2xl touch-none"
            />
          </main>

          <div 
            style={{ height: `${mobileSplitHeight}%` }}
            className={`absolute left-0 bottom-0 w-full z-20 bg-[#000000] flex flex-col min-h-0 overflow-hidden transition-transform duration-500 ease-in-out ${mobileScreen !== 'briefing' ? 'translate-y-0' : 'translate-y-[100%]'}`}
          >
            {mobileScreen !== 'briefing' && (
              <div 
                className="w-full h-8 bg-[#1A1D23] border-t border-[#2D333B] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] flex items-center justify-center shrink-0 cursor-row-resize touch-none z-30 relative"
                onPointerDown={(e) => {
                  isDraggingMobileSplitRef.current = true;
                  (e.target as Element).setPointerCapture(e.pointerId);
                }}
              >
                <div className="w-16 h-1.5 bg-[#C9D1D9] rounded-full opacity-60" />
                
                {/* Max/Mid/Min Position Buttons */}
                <div className="absolute right-2 flex items-center gap-1 pointer-events-auto">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileSplitHeight(85); }}
                    className="p-1 text-[#8B949E] hover:text-[#3FB950] transition-colors"
                    title="Maximize"
                  >
                    <ChevronUp size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileSplitHeight(50); }}
                    className="p-1 text-[#8B949E] hover:text-[#58A6FF] transition-colors"
                    title="Mid"
                  >
                    <Minus size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileSplitHeight(mobileMinSplitPct); }}
                    className="p-1 text-[#8B949E] hover:text-[#F85149] transition-colors"
                    title="Minimize"
                  >
                    <ChevronDown size={24} />
                  </button>
                </div>
              </div>
            )}
            
            {mobileScreen === 'logic' && (
              <>
                {atMobileBottomMin ? (
                  <div className="shrink-0 flex items-stretch gap-2 px-2 py-1 bg-[#1A1D23] border-b border-[#2D333B] min-h-[48px]">
                    <div className="flex flex-col min-w-0 flex-1 justify-center gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono font-bold text-[#3FB950] truncate max-w-[40%]">
                          {compiledPhases[currentPhase]?.label || `PHASE_${currentPhase + 1}`}
                        </span>
                        <span className="text-[11px] font-mono text-[#3FB950] shrink-0">{timer.toFixed(1)}s</span>
                        <span
                          className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 ${
                            lightState === 'GREEN'
                              ? 'bg-[#3FB950] text-[#0D0F12]'
                              : lightState === 'YELLOW'
                                ? 'bg-[#D29922] text-[#0D0F12]'
                                : 'bg-[#F85149] text-[#0D0F12]'
                          }`}
                        >
                          {lightState}
                        </span>
                        {isPlaying && (
                          <span className="text-[8px] bg-[#3FB950] text-[#0D0F12] px-1 py-0.5 rounded font-bold shrink-0">ACTIVE</span>
                        )}
                      </div>
                      <div className="h-1 bg-[#2D333B] rounded-full overflow-hidden w-full max-w-full">
                        <div className="h-full bg-[#3FB950] transition-all duration-100" style={{ width: `${getPercentage()}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-0.5 content-center max-w-[52%] min-w-0">
                      {Array.from(new Set([...activeMovements, ...yieldMovements])).slice(0, 8).map((m) => {
                        const y = yieldMovements.includes(m);
                        return (
                          <span
                            key={m}
                            title={MovementLabels[m]}
                            className={`flex items-center justify-center w-5 h-5 rounded border shrink-0 ${
                              y ? 'bg-[#D29922]/10 border-[#D29922]/30 text-[#D29922]' : 'bg-[#3FB950]/10 border-[#3FB950]/30 text-[#3FB950]'
                            }`}
                          >
                            {getMovementIcon(m, 10)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col p-2 overflow-y-auto">
                    <div className="flex flex-col gap-2 h-full">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <button
                          onClick={() => applyTemplate(userTemplate)}
                          className={`flex-1 text-[10px] py-1.5 rounded-none font-mono border transition-all ${programCode === userTemplate ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}
                        >
                          CUSTOM
                        </button>
                        <button
                          onClick={saveUserTemplate}
                          className="px-3 py-1.5 rounded-none bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:text-[#3FB950] transition-colors"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] text-[#56D364] font-mono uppercase tracking-wide leading-tight">{engineeringTemplateBlurb.title}</div>
                        <div className="text-[10px] text-[#b7bdc8] font-mono leading-snug">{engineeringTemplateBlurb.body}</div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col">
                        <MobileEditor
                          programCode={programCode}
                          setProgramCode={setProgramCode}
                          closedLanes={(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).closedLanes}
                          appendPhase={appendPhase}
                          deleteLastLine={deleteLastLine}
                          activePhaseIndex={currentPhase}
                          isPlaying={isPlaying}
                        />
                      </div>
                      {programError && (
                        <div className="text-[11px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight bg-[#F85149]/10 p-2 border border-[#F85149]/30">
                          {programError}
                        </div>
                      )}
                      <div className="mt-auto pt-2 pb-2">
                        <button
                          onClick={() => {
                            hapticHeavy();
                            compile();
                            addLog('FIRMWARE COMPILED', 'var(--green)');
                            if (!programError) {
                              setSessionCarsCleared(0);
                                            setSessionCarsByDir({ N: 0, S: 0, E: 0, W: 0 });
                              setSessionCrashes(0);
                              setSessionTime(0);
                              setZoom(0.8);
                              isPlayingRef.current = true;
                              setIsPlaying(true);
                              // --- ADD THIS LINE: Force switch to telemetry dashboard ---
                              setMobileScreen('metrics');
                              setMobileSplitHeight(mobileMinSplitPct);
                            }
                          }}
                          className="w-full text-[14px] bg-[#3FB950]/10 text-[#3FB950] py-3 border-y-2 border-[#3FB950] font-bold uppercase tracking-[0.2em] shadow-[inset_0_0_20px_rgba(63,185,80,0.1)] hover:bg-[#3FB950]/20 transition-colors"
                        >
                          [ EXECUTE FIRMWARE ]
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {mobileScreen === 'metrics' && (
              <>
                <div className="shrink-0 flex bg-[#1A1D23] border-b-2 border-[#2D333B]">
                  <div className="flex-1 p-2 border-r-2 border-[#2D333B] flex flex-col items-center justify-center">
                    <span className="text-[9px] text-[#8B949E] font-mono">CLEARED</span>
                    <span className="text-[16px] text-[#3FB950] font-mono font-bold">{sessionCarsCleared}</span>
                  </div>
                  <div className="flex-1 p-2 border-r-2 border-[#2D333B] flex flex-col items-center justify-center">
                    <span className="text-[9px] text-[#8B949E] font-mono">CRASHES</span>
                    <span className={`text-[16px] font-mono font-bold ${sessionCrashes > 0 ? 'text-[#F85149]' : 'text-[#8B949E]'}`}>{sessionCrashes}</span>
                  </div>
                  <div className="flex-1 p-2 border-r-2 border-[#2D333B] flex flex-col items-center justify-center">
                    <span className="text-[9px] text-[#8B949E] font-mono">QUEUES</span>
                    <span className={`text-[16px] font-mono font-bold ${totalCongestion > 0 ? 'text-[#D29922]' : 'text-[#8B949E]'}`}>{totalCongestion}</span>
                  </div>
                  <div className="flex-1 p-2 flex flex-col items-center justify-center">
                    <span className="text-[9px] text-[#8B949E] font-mono">TIME</span>
                    <span className="text-[16px] text-[#58A6FF] font-mono font-bold">
                      {Math.floor(sessionTime / 60)
                        .toString()
                        .padStart(2, '0')}
                      :{(sessionTime % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                {!atMobileBottomMin && (
                  <div className="flex-1 min-h-0 relative bg-[#0D0F12]">
                    <div className="p-3 flex flex-col gap-4 overflow-y-auto scrollbar-hide h-full">
                      <CollapsibleSection id="flow" title="TRAFFIC RATES" isCollapsed={collapsed.flow} onToggle={toggleCollapsed}>
                        <TrafficFlowRates 
                          rates={trafficRates} 
                          isSandbox={currentLevel?.isSandbox} 
                          onRateChange={(dir, val) => setTrafficRates(prev => ({ ...prev, [dir]: val }))} 
                        />
                      </CollapsibleSection>
                      <CollapsibleSection id="queue" title="CONGESTION ANALYTICS" isCollapsed={collapsed.queue} onToggle={toggleCollapsed}>
                        <QueueChart history={queueHistory} />
                      </CollapsibleSection>
                      <CollapsibleSection id="analytics" title="PHASE METRICS" isCollapsed={collapsed.analytics} onToggle={toggleCollapsed}>
                        <AnalyticalChart history={timingHistory} />
                      </CollapsibleSection>
                      <CollapsibleSection id="log" title="PHASE LOG" isCollapsed={collapsed.log} onToggle={toggleCollapsed}>
                        <PhaseLogList logs={logs} maxHeightClass="max-h-36" />
                      </CollapsibleSection>
                      <div className="h-4 shrink-0" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <nav className="shrink-0 h-[60px] bg-[#1A1D23] border-t-2 border-[#2D333B] flex z-40 relative">
           <button onClick={() => setMobileScreen('briefing')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'briefing' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><Mail size={20}/>DIRECTIVE</button>
           <button onClick={() => setMobileScreen('logic')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'logic' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><Terminal size={20}/>LOGIC</button>
           <button onClick={() => setMobileScreen('metrics')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'metrics' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><Activity size={20}/>METRICS</button>
        </nav>

        <AnimatePresence>
          {crashInfo && (
            <CrashModal
              info={crashInfo}
              onResetAndEdit={() => {
                resetSimulation('MANUAL');
                setMobileScreen('logic');
              }}
            />
          )}
          {levelCompleteInfo && (
            <LevelCompleteModal 
              info={levelCompleteInfo}
              levelId={activeLevelId}
              isLastLevel={!(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).nextLevelId}
              onNext={() => {
                setIsOptimizing(false);
                const currentLvl = level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0];
                if (!currentLvl.nextLevelId) {
                  setIsFreeplay(true);
                  setLevelCompleteInfo(null);
                  setIsPlaying(true);
                  isPlayingRef.current = true;
                } else {
                  handleSelectLevel(currentLvl.nextLevelId);
                  setMobileScreen('briefing');
                }
              }}
              onRetry={() => {
                resetSimulation('MANUAL');
                setMobileScreen('logic');
                setIsOptimizing(true);
              }}
            />
          )}
      </AnimatePresence>
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-full px-4 items-center">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`px-4 py-2 font-mono text-[10px] font-bold tracking-widest border-2 shadow-[0_0_20px_rgba(0,0,0,0.5)] ${
                toast.type === 'success' 
                  ? 'bg-[#0D0F12] border-[#3FB950] text-[#3FB950]' 
                  : 'bg-[#0D0F12] border-[#58A6FF] text-[#58A6FF]'
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <ManualOverlay isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </div>
  );
}

  return (
    <div
      className={`h-screen w-full grid grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-[#0D0F12] ${isResizingSidebar ? '' : 'transition-[grid-template-columns] duration-300 ease-in-out'} relative`}
      style={{ gridTemplateColumns: `${sidebarColumnWidth}px minmax(0,1fr)` }}
    >
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:48px_48px] opacity-10 pointer-events-none" />
      
      {/* Corner Technical Overlays */}
      <div className="pointer-events-none absolute top-[60px] left-[300px] font-mono text-[9px] text-[#8B949E] flex flex-col gap-0.5 opacity-30 z-0">
        <div>NET_LOAD: {(0.4 + Math.random() * 0.2).toFixed(2)}%</div>
        <div>MEM_BANK: 0x82/0xFF</div>
        <div>SYS_TEMP: 42.4°C</div>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-6 font-mono text-[9px] text-[#8B949E] text-right opacity-30 z-0">
        <div>v4.2.0-STABLE</div>
        <div>COORD: 52.34N 13.40E</div>
      </div>

      {/* Header Area */}
      <header className="col-span-full bg-[#1A1D23] border-b border-[#2D333B] flex items-center justify-between px-4 z-10 gap-3">
        <div className="flex items-center gap-3 font-mono font-bold tracking-wider text-xs min-w-0 flex-wrap">
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-white/5 rounded transition-colors text-[#C9D1D9] hover:text-white flex items-center justify-center"
            title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <span className="text-[#3FB950] shrink-0">●</span>
          <span className="truncate">TRAFFIC_SEC_082_V4.2</span>
          <span className="bg-[#3FB950]/10 text-[#3FB950] px-2 py-0.5 rounded border border-[#3FB950] text-[11px] shrink-0">OPERATIONAL</span>
          <button
            type="button"
            onClick={() => setIsManualOpen(true)}
            className="shrink-0 rounded border border-[#2D333B] px-2.5 py-1 text-[10px] font-mono font-bold text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#3FB950] transition-colors"
          >
            MANUAL
          </button>
          <button
            type="button"
            onClick={returnToMainMenu}
            className="shrink-0 rounded border border-[#2D333B] px-2.5 py-1 text-[10px] font-mono font-bold text-[#8B949E] hover:border-[#F85149]/50 hover:text-[#F85149] transition-colors"
          >
            MENU
          </button>
        </div>
        <div className="font-mono text-xs text-[#C9D1D9] flex flex-wrap items-center justify-end gap-x-4 gap-y-1 sm:gap-x-6">
          {installDeferred && !isStandaloneDisplay && (
            <button
              type="button"
              onClick={async () => {
                const ev = installDeferred;
                if (!ev) return;
                await ev.prompt();
                await ev.userChoice;
                setInstallDeferred(null);
              }}
              className="flex shrink-0 items-center gap-2 rounded border border-[#D29922]/60 bg-[#D29922]/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-[#D29922] transition-colors hover:bg-[#D29922]/20"
            >
              <Download size={14} className="shrink-0" />
              INSTALL TERMINAL
            </button>
          )}
          <div>CYCLE: {cycleLength}s / {MAX_TOTAL_LOOP_SECONDS}s</div>
          <div className="text-[#8B949E]">
            LOOP: {loopLastMs.toFixed(2)}ms · AVG10: {loopAvg10Ms.toFixed(2)}ms
          </div>
        </div>
      </header>

      {/* Left Sidebar: Controls & Monitors */}
      <aside className={`relative col-start-1 row-start-2 bg-[#1A1D23] border-r border-[#2D333B] p-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide min-h-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'opacity-0 pointer-events-none translate-x-[-100%]' : 'opacity-100 translate-x-0'}`}>
        <CollapsibleSection id="monitor" title="MONITOR" isCollapsed={collapsed.monitor} onToggle={toggleCollapsed}>
          <div className="bg-black/20 border border-[#2D333B] p-3 rounded flex flex-col overflow-hidden">
             <div className="flex justify-between items-center mb-2">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-mono font-bold tracking-wider text-[#3FB950]">
                   {compiledPhases[currentPhase]?.label || `PHASE_${currentPhase + 1}`}
                 </span>
                 <div className="text-xl font-mono text-[#3FB950]">{timer.toFixed(1)}s</div>
               </div>
               <div className="flex items-center gap-1.5">
                 <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${lightState === 'GREEN' ? 'bg-[#3FB950] text-[#0D0F12]' : lightState === 'YELLOW' ? 'bg-[#D29922] text-[#0D0F12]' : 'bg-[#F85149] text-[#0D0F12]'}`}>
                   {lightState}
                 </span>
                 {isPlaying && (
                   <span className="text-[9px] bg-[#3FB950] text-[#0D0F12] px-1 py-0.5 rounded font-bold animate-pulse">
                     ACTIVE
                   </span>
                 )}
               </div>
             </div>

             <div className="flex flex-col gap-1 overflow-y-auto scrollbar-hide flex-1 max-h-32 mb-2">
               {DIRECTIONS.map(dir => {
                 const allMovements = [...activeMovements, ...yieldMovements];
                 const movements = allMovements.filter(m => getDirection(m) === dir);
                 if (movements.length === 0) return null;
                 const sortedMovements = [...movements].sort((a, b) => {
                   const valA = a % 3 === 0 ? 3 : a % 3;
                   const valB = b % 3 === 0 ? 3 : b % 3;
                   return valA - valB;
                 });

                 return (
                   <div key={dir} className="flex items-center justify-between gap-2 border-b border-[#2D333B]/30 last:border-0 pb-1 last:pb-0">
                     <div className="text-[9px] text-[#C9D1D9] font-mono tracking-tighter uppercase opacity-90 shrink-0">
                       {dir.replace('BOUND', '')}
                     </div>
                     <div className="flex gap-1">
                       {sortedMovements.map(m => {
                         const isYield = yieldMovements.includes(m);
                         const activeClass = isYield
                            ? 'bg-[#D29922]/10 border-[#D29922]/30 text-[#D29922]'
                            : 'bg-[#3FB950]/10 border-[#3FB950]/30 text-[#3FB950]';
                         return (
                         <span 
                           key={m} 
                           title={MovementLabels[m]}
                           className={`flex items-center justify-center w-6 h-6 rounded border ${activeClass}`}
                         >
                           {getMovementIcon(m, 12)}
                         </span>
                       )})}
                     </div>
                   </div>
                 );
               })}
             </div>

             <div className="h-1 bg-[#2D333B] w-full rounded-full overflow-hidden shrink-0">
               <div className="h-full bg-[#3FB950] transition-all duration-100" style={{ width: `${getPercentage()}%` }} />
             </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="editor" title="PHASE SEQUENCE" isCollapsed={collapsed.editor} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => applyTemplate(userTemplate)}
                  className={`flex-1 text-[10px] py-1 rounded font-mono border transition-all ${programCode === userTemplate ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}
                  title={userTemplate ? "Load Saved Template" : "No saved template"}
                >
                  CUSTOM
                </button>
                <button 
                  onClick={saveUserTemplate}
                  className="px-2 py-1 rounded bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/40 transition-colors"
                  title="Save current as CUSTOM"
                >
                  <Save size={12} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[#C9D1D9]/70 font-mono leading-tight">
                {isEditMode ? '# phase(N, min=5, max=10): then .GO/.YIELD cmds (or if/phase_insert)' : 'VIEW_MODE (READ_ONLY)'}
              </div>
              <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className="text-[11px] px-2 py-0.5 rounded font-mono border border-[#2D333B] hover:bg-white/5 transition-colors text-[#C9D1D9]"
              >
                {isEditMode ? 'SWITCH_TO_VIEW' : 'SWITCH_TO_EDIT'}
              </button>
            </div>

            {isEditMode ? (
              <div className="flex flex-col gap-2">
                <div className="relative w-full h-64 bg-black/40 border border-[#2D333B] rounded focus-within:border-[#3FB950] transition-colors overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="python"
                    theme="vs-dark"
                    value={programCode}
                    onChange={(val) => setProgramCode(val || '')}
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: "off",
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 }
                    }}
                  />
                </div>
                <div className="bg-[#1A1D23] border border-[#2D333B] p-2 rounded flex flex-col gap-2">
                  <div className="flex gap-1 justify-between items-center">
                    <div className="text-[10px] font-bold text-[#C9D1D9]">COMMAND BUILDER</div>
                    <div className="flex gap-1">
                      <button onClick={appendPhase} className="px-2 py-1 text-[10px] font-mono rounded bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:bg-white/5 transition-colors">
                        + PHASE
                      </button>
                      <button onClick={deleteLastLine} className="p-1 text-[#F85149] hover:bg-[#F85149]/20 rounded border border-transparent hover:border-[#F85149]/30 transition-colors" title="Delete Last Command">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {['NORTH', 'SOUTH', 'EAST', 'WEST', 'CROSSWALK'].map(d => (
                        <button key={d} onClick={() => setCmdDir(d)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdDir === d ? 'bg-[#58A6FF]/20 border-[#58A6FF] text-[#58A6FF]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{d}</button>
                    ))}
                  </div>
                  
                  {cmdDir && cmdDir !== 'CROSSWALK' && (
                      <div className="flex flex-wrap gap-1">
                        {['LEFT', 'STRAIGHT', 'RIGHT'].map(t => (
                            <button key={t} onClick={() => setCmdTurn(t)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdTurn === t ? 'bg-[#D29922]/20 border-[#D29922] text-[#D29922]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{t}</button>
                        ))}
                      </div>
                  )}

                  {cmdDir === 'CROSSWALK' && (
                      <div className="flex flex-wrap gap-1">
                        {['NORTH', 'SOUTH', 'EAST', 'WEST'].map(t => (
                            <button key={t} onClick={() => setCmdTurn(t)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdTurn === t ? 'bg-[#D29922]/20 border-[#D29922] text-[#D29922]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{t}</button>
                        ))}
                      </div>
                  )}

                  {cmdDir && cmdTurn && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => appendCommand('GO')} className="flex-1 py-1.5 bg-[#3FB950]/20 text-[#3FB950] border border-[#3FB950]/40 rounded text-[11px] font-bold hover:bg-[#3FB950]/30 transition-colors">ADD .GO</button>
                        <button onClick={() => appendCommand('YIELD')} className="flex-1 py-1.5 bg-[#D29922]/20 text-[#D29922] border border-[#D29922]/40 rounded text-[11px] font-bold hover:bg-[#D29922]/30 transition-colors">ADD .YIELD</button>
                      </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full max-h-64 overflow-y-auto scrollbar-hide">
                <BadgeView phases={compiledPhases} currentPhase={currentPhase} />
              </div>
            )}

            {programError && (
              <div className="text-[11px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight bg-[#F85149]/10 p-1 border border-[#F85149]/30 rounded">
                {programError}
              </div>
            )}
            <button 
              onClick={() => {
                  compile();
                  addLog("PROGRAM UPDATED", "var(--green)");
                  setIsEditMode(false);
              }}
              className="text-[11px] bg-[#3FB950]/20 text-[#3FB950] py-1 border border-[#3FB950]/40 rounded hover:bg-[#3FB950]/30"
            >
              RECOMPILE_PHASES
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="flow" title="TRAFFIC RATES" isCollapsed={collapsed.flow} onToggle={toggleCollapsed}>
            <TrafficFlowRates 
              rates={trafficRates} 
              isSandbox={currentLevel?.isSandbox} 
              onRateChange={(dir, val) => setTrafficRates(prev => ({ ...prev, [dir]: val }))} 
            />
        </CollapsibleSection>

        <CollapsibleSection id="phaseTimings" title="PHASE DURATION" isCollapsed={collapsed.phaseTimings} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-[#C9D1D9]/70 mb-1">
              <span>SYSTEM_MODE</span>
              <button 
                onClick={() => setIsAdaptive(!isAdaptive)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${isAdaptive ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]' : 'bg-gray-800 text-[#C9D1D9] border border-gray-700'}`}
              >
                {isAdaptive ? 'ADAPTIVE_ON' : 'MANUAL_OVERRIDE'}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-[#C9D1D9]/70 mb-1">
              <span>VISUAL_OVERLAY</span>
              <button
                onClick={() => setShowHeatmap(prev => !prev)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${showHeatmap ? 'bg-[#F85149]/10 text-[#F85149] border border-[#F85149]' : 'bg-gray-800 text-[#C9D1D9] border border-gray-700'}`}
              >
                {showHeatmap ? 'HEATMAP_ON' : 'HEATMAP_OFF'}
              </button>
            </div>
            <div className="flex flex-col gap-2 max-h-[min(52vh,28rem)] overflow-y-auto pr-1 scrollbar-hide">
              {Array.from({ length: phaseRowCount }, (_, i) => {
                const label =
                  compiledPhases.length > 0 ? compiledPhases[i].label : `PHASE_${i + 1}`;
                const sec = phaseTimings[i] ?? DEFAULT_PHASE_GREEN_SECONDS;
                const sliderMax = MAX_TOTAL_LOOP_SECONDS;
                return (
                  <div key={`${label}-${i}`} className="pb-2 border-b border-[#2D333B]/40 last:border-0">
                    <div className="flex justify-between items-center mb-1 px-0.5 gap-2">
                      <span className="text-[11px] font-mono text-[#C9D1D9] uppercase truncate" title={label}>
                        {label}
                      </span>
                      <span className="text-[11px] text-[#3FB950] font-mono shrink-0">{sec}s</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_PHASE_GREEN_SECONDS}
                      max={sliderMax}
                      value={sec}
                      disabled={isAdaptive}
                      onChange={(e) => handlePhaseTimingChange(i, parseInt(e.target.value, 10))}
                      className="w-full accent-[#3FB950] h-1"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="telemetry" title="TELEMETRY" isCollapsed={collapsed.telemetry} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-4">
            <div className="bg-black/20 border border-[#2D333B] p-3 rounded flex flex-col gap-1">
               <div className="text-[10px] uppercase text-[#8B949E] tracking-wider">NETWORK DENSITY</div>
               <div className="text-2xl font-mono text-[#D29922]">
                 {vehiclesRef.current.length.toString().padStart(2, '0')}
                 <span className="text-[10px] text-[#8B949E] ml-2">ON_ROAD</span>
               </div>
               <div className="text-lg font-mono text-[#D29922]/70 -mt-1">
                 {Object.values(offScreenQueues).reduce((a, b) => a + b, 0).toString().padStart(2, '0')}
                 <span className="text-[9px] text-[#8B949E] ml-2 uppercase">WAITING</span>
               </div>
               <div className="text-[10px] text-[#8B949E] font-mono uppercase mt-1 px-1.5 py-0.5 bg-black/40 rounded border border-[#2D333B]/50 w-fit">
                  {vehiclesRef.current.length > 20 ? 'CONGESTION_HIGH' : vehiclesRef.current.length > 10 ? 'CONGESTION_MID' : 'NOMINAL_FLOW'}
               </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#8B949E] tracking-wider mb-2">CONGESTION ANALYTICS</div>
              <QueueChart history={queueHistory} />
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#8B949E] tracking-wider mb-2">PHASE METRICS</div>
              <AnalyticalChart history={timingHistory} />
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#8B949E] tracking-wider mb-2">PHASE LOG</div>
              <PhaseLogList logs={logs} maxHeightClass="max-h-64" />
            </div>
          </div>
        </CollapsibleSection>

        <div className="mt-auto space-y-4 pt-4 border-t border-[#2D333B]">
          <div className="flex justify-between items-center w-full py-2 px-3 rounded bg-black/20 border border-[#2D333B]">
            <span className="text-[#8B949E] text-[11px] font-bold tracking-widest font-mono">MASTER PWR</span>
            <MasterSwitch isOn={isPlaying} onToggle={togglePlayback} />
          </div>
          <button 
            onClick={() => resetSimulation('MANUAL')}
            className="w-full py-2 rounded text-[13px] font-bold border border-[#2D333B] text-[#C9D1D9] hover:bg-white/5"
          >
            RESET BUFFER
          </button>
        </div>
      </aside>

      {/* Center Area: Simulator Visual */}
      <main ref={simMainRef} className="col-start-2 row-start-2 relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]">
        {!sidebarCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={startSidebarResize}
            className="absolute left-0 top-0 z-30 h-full w-3 -translate-x-1/2 cursor-col-resize group"
          >
            <div className="mx-auto h-full w-[2px] bg-[#3FB950]/35 transition-colors group-hover:bg-[#3FB950]/80 group-active:bg-[#3FB950]" />
          </div>
        )}
        <div className="absolute top-6 right-6 z-20 flex flex-row items-start gap-2">
          <div className="flex flex-col gap-2">
            <MasterSwitch isOn={isPlaying} onToggle={togglePlayback} />
            {TIME_SCALE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTimeScale(s)}
                className={`min-w-[3rem] py-1.5 px-2 rounded text-[11px] font-mono font-bold border transition-all shadow-xl ${
                  timeScale === s
                    ? 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950]'
                    : 'border-[#2D333B] bg-[#1A1D23] text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#C9D1D9]'
                }`}
                title={`Simulation ${s}x`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center w-full h-full overflow-hidden">
          <canvas 
            ref={canvasRef} 
            width={CANVAS_SIZE} 
            height={CANVAS_SIZE}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDraggingCanvasRef.current ? 'none' : 'transform 0.15s ease-out'
            }}
            className="box-border max-h-[min(70vh,100%)] max-w-[min(70vh,100%)] aspect-square w-full cursor-crosshair rounded border border-[#2D333B] shadow-2xl touch-none"
          />
        </div>
        {inspectPanel && (
          <div
            className="pointer-events-none absolute z-[25] w-[min(268px,calc(100%-16px))]"
            style={{ left: inspectPanel.left, top: inspectPanel.top }}
          >
            <VehicleInspectTooltip vehicle={inspectPanel.vehicle} />
          </div>
        )}
        <AnimatePresence>
          {crashInfo && (
            <CrashModal
              info={crashInfo}
              onResetAndEdit={() => {
                resetSimulation('MANUAL');
                // Desktop doesn't have a specific logic screen toggle needed here
                // as the editor is usually visible or collapsible.
              }}
            />
          )}
          {levelCompleteInfo && (
            <LevelCompleteModal 
              info={levelCompleteInfo}
              levelId={activeLevelId}
              isLastLevel={!(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).nextLevelId}
              onNext={() => {
                setIsOptimizing(false);
                const currentLvl = level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0];
                if (!currentLvl.nextLevelId) {
                  setIsFreeplay(true);
                  setLevelCompleteInfo(null);
                  setIsPlaying(true);
                  isPlayingRef.current = true;
                } else {
                  handleSelectLevel(currentLvl.nextLevelId);
                }
              }}
              onRetry={() => {
                resetSimulation('MANUAL');
                setIsOptimizing(true);
              }}
            />
          )}
        </AnimatePresence>
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none items-center">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] border-2 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${
                  toast.type === 'success' 
                    ? 'bg-[#0D0F12] border-[#3FB950] text-[#3FB950] shadow-[0_0_15px_rgba(63,185,80,0.2)]' 
                    : 'bg-[#0D0F12] border-[#58A6FF] text-[#58A6FF] shadow-[0_0_15px_rgba(88,166,255,0.2)]'
                }`}
              >
                {toast.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
      <FirmwareUpdatePrompt />
      <ManualOverlay isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </div>
  );
}
