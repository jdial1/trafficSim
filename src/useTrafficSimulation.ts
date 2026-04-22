/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, ChevronDown, ChevronRight, Activity, PanelLeftClose, PanelLeftOpen, CornerUpLeft, CornerUpRight, Save, Plus, Minus, Trash2, Download, Mail, Terminal, Map as MapIcon } from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Movement, Vehicle, Lane, LightState, MovementTiming, VehicleType, LogEntry, HistoryEntry, QueueHistoryEntry, BriefingContent, level1Briefing } from './types';
import { parseTrafficProgram, Phase, ConditionalRule, PhaseCommand, KEYWORD_MAP } from './interpreter';
import { PRNG } from './utils/prng';
import { LevelManager } from './LevelManager';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, DEFAULT_TIMINGS, DEFAULT_PHASE_GREEN_SECONDS, DEFAULT_BUILTIN_PHASE_TIMINGS, BASE_SPAWN_RATE, SPAWN_DRIFT_SPEED, MIN_PHASE_GREEN_SECONDS, MAX_TOTAL_LOOP_SECONDS, clampPhaseTimingsToLoopCap, SIDEBAR_DEFAULT_WIDTH, ZOOM_STEP, MOBILE_SPLIT_HANDLE_PX, MOBILE_COLLAPSED_STRIP_PX, MOBILE_SPLIT_MAX_RATIO, HEAT_GRID_COLS, HEAT_GRID_ROWS, LOOP_LAG_LOG_MS, LOOP_HUD_MIN_INTERVAL_MS, MAX_SIM_INTEGRATION_STEP, LEGENDARY_SPAWN_CHANCE, LANE_MAP, LEFT_LANE_IDS, ADJACENT_RIGHT_MERGE_PAIR_KEYS, ADJACENT_LEFT_MERGE_PAIR_KEYS, STOP_LINE, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, HEATMAP_DECAY, HEATMAP_GAIN, HEATMAP_MAX, SKID_MARK_BRAKE_THRESHOLD, SKID_MARK_TTL_MS, MAX_SKID_MARK_SEGMENTS, BASE_SAFE_GAP, VEHICLE_COLORS } from './constants';
import { useGlobalState } from './GlobalStateContext';
import { loadSession, saveSession, narrowViewport, defaultZoom, MovementLabels, DIRECTIONS, getDirection, getMovementIcon, formatActiveMovements, hapticCrash, hapticHeavy, hapticError, playThunk, startAtmosphericHum, stopAtmosphericHum } from './traffic';
import { IntersectionEngine, CrashInfo, RearTires, pickVehicleAtCanvasPoint, getPathEndPoint, renderVehicleSprite, getPathGeometry, getRearTirePositions } from './IntersectionEngine';
import { Histogram, ManualOverlay, LevelSelect, GameIntro, FirmwareUpdatePrompt } from './CoreComponents';
import vehicleCatalog from './data/vehicles.json';

export function useTrafficSimulation() {
  const { unlockedLevels, unlockLevel, saveSolution, saveHighscore, highscores } = useGlobalState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prngRef = useRef<PRNG>(new PRNG(42));
  const simMainRef = useRef<HTMLElement | null>(null);
  const mobileSplitHostRef = useRef<HTMLDivElement | null>(null);
  const inspectPaintRef = useRef<Vehicle | null>(null);
  const [inspectPanel, setInspectPanel] = useState<{ vehicle: Vehicle; left: number; top: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    if (!isPlaying) return;
    inspectPaintRef.current = null;
    setInspectPanel(null);
  }, [isPlaying]);
  const [phaseTimings, setPhaseTimings] = useState<number[]>(() => [...DEFAULT_BUILTIN_PHASE_TIMINGS]);
  
  // Traffic Flow State
  const [trafficRates, setTrafficRates] = useState<Record<string, number>>({
    N: BASE_SPAWN_RATE, S: BASE_SPAWN_RATE, E: BASE_SPAWN_RATE, W: BASE_SPAWN_RATE
  });
  const [offScreenQueues, setOffScreenQueues] = useState<Record<string, number>>({});
  const [isAdaptive, setIsAdaptive] = useState(true);
  
  // UI State
  const [introPhase, setIntroPhase] = useState<'splash' | 'home' | null>('splash');
  const [mobileScreen, setMobileScreen] = useState<'briefing' | 'logic' | 'metrics'>('briefing');
  const mobileScreenRef = useRef(mobileScreen);
  mobileScreenRef.current = mobileScreen;
  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return narrowViewport() && window.matchMedia('(orientation: portrait)').matches;
  });
  const [executionSplitActive, setExecutionSplitActive] = useState(false);
  const [isFreeplay, setIsFreeplay] = useState(false);
  const [sessionCarsCleared, setSessionCarsCleared] = useState(0);
  const [sessionCarsByDir, setSessionCarsByDir] = useState<Record<string, number>>({ N: 0, S: 0, E: 0, W: 0 });
  const [sessionCrashes, setSessionCrashes] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionTime, setSessionTime] = useState(0);
  const [activeLevelId, setActiveLevelId] = useState('1A');
  const currentLevel = useMemo(() => level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0], [activeLevelId]);

  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<any[]>([]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobilePortrait(narrowViewport() && window.matchMedia('(orientation: portrait)').matches);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (introPhase !== 'splash') return;
    const t = window.setTimeout(() => setIntroPhase('home'), 2600);
    return () => clearTimeout(t);
  }, [introPhase]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => narrowViewport());
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [mobileSplitHeight, setMobileSplitHeight] = useState(60);
  const [mobileMinSplitPct, setMobileMinSplitPct] = useState(14);
  const isDraggingMobileSplitRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);

  useEffect(() => {
    if (!isMobilePortrait) return;
    const host = mobileSplitHostRef.current;
    if (!host) return;
    const measure = () => {
      const hr = host.getBoundingClientRect().height;
      if (hr <= 0) return;
      const strip =
        mobileScreen !== 'briefing' && (mobileScreen === 'metrics' || mobileScreen === 'logic') ? MOBILE_COLLAPSED_STRIP_PX : 0;
      setMobileMinSplitPct(((MOBILE_SPLIT_HANDLE_PX + strip) / hr) * 100);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [isMobilePortrait, mobileScreen]);

  useEffect(() => {
    if (!isMobilePortrait) return;
    if (mobileScreen !== 'metrics' && mobileScreen !== 'logic') return;
    setMobileSplitHeight((prev) => Math.max(prev, mobileMinSplitPct));
  }, [isMobilePortrait, mobileScreen, mobileMinSplitPct]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingMobileSplitRef.current) return;
      e.preventDefault();
      const host = mobileSplitHostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const h = rect.height;
      if (h <= 0) return;
      const maxBottom = h * MOBILE_SPLIT_MAX_RATIO;
      const stripPx =
        mobileScreenRef.current === 'metrics' || mobileScreenRef.current === 'logic' ? MOBILE_COLLAPSED_STRIP_PX : 0;
      const minBottomPx = MOBILE_SPLIT_HANDLE_PX + stripPx;
      const bottomPx = Math.min(maxBottom, Math.max(minBottomPx, rect.bottom - e.clientY));
      setMobileSplitHeight((bottomPx / h) * 100);
    };

    const handlePointerUp = () => {
      isDraggingMobileSplitRef.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    phaseTimings: true,
    telemetry: false,
    flow: true,
    editor: true,
    monitor: false
  });
  const [timingHistory, setTimingHistory] = useState<HistoryEntry[]>([]);
  const [queueHistory, setQueueHistory] = useState<QueueHistoryEntry[]>([]);
  
  // Controller State
  const [wiringPhaseIndex, setWiringPhaseIndex] = useState<number | null>(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [lightState, setLightState] = useState<LightState>('GREEN');
  const [timer, setTimer] = useState(0);
  const [logs, setLogs] = useState<{ id: string, time: string, event: string, color?: string }[]>([]);
  const [zoom, setZoom] = useState(() => defaultZoom());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartCanvasRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const activePointersRef = useRef<Map<number, {x: number, y: number}>>(new Map());
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(0);
  const [timeScale, setTimeScale] = useState<TimeScale>(1);
  const timeScaleRef = useRef<TimeScale>(1);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [loopLastMs, setLoopLastMs] = useState(0);
  const [loopAvg10Ms, setLoopAvg10Ms] = useState(0);
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null);
  useEffect(() => {
    if (crashInfo) {
      if (isMobilePortrait) {
        setMobileScreen('logic');
        setExecutionSplitActive(false);
      }
    }
  }, [crashInfo, isMobilePortrait]);

  useEffect(() => {
    if (isMobilePortrait && mobileScreen === 'briefing') {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [mobileScreen, isMobilePortrait]);

  const [isCrashModalMinimized, setIsCrashModalMinimized] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'info' }[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const [levelCompleteInfo, setLevelCompleteInfo] = useState<{
    carsCleared: number;
    timeSeconds: number;
    cycleTime: number;
    linesOfCode: number;
    hardwareCost: number;
  } | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [installDeferred, setInstallDeferred] = useState<BeforeInstallPromptEventExtended | null>(null);
  const [isStandaloneDisplay, setIsStandaloneDisplay] = useState(false);

  useEffect(() => {
    setIsStandaloneDisplay(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallDeferred(e as BeforeInstallPromptEventExtended);
    };
    const onAppInstalled = () => setInstallDeferred(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Store accumulated demand per phase over the current cycle
  const cycleDemandRef = useRef<number[]>([]);
  const skipConditionalAfterInjectRef = useRef(false);

  useEffect(() => {
    /* currentLevel mapped by useMemo */
    const base = BASE_SPAWN_RATE;
    const closed = currentLevel?.closedLanes || [];
    
    // Check if level has custom weights, otherwise use base
    const weights = currentLevel?.trafficWeights || { N: 1, S: 1, E: 1, W: 1 };
    
    setTrafficRates({
        N: closed.some(id => id.startsWith('nb-')) ? 0 : (base * (weights.N ?? 1)),
        S: closed.some(id => id.startsWith('sb-')) ? 0 : (base * (weights.S ?? 1)),
        E: closed.some(id => id.startsWith('eb-')) ? 0 : (base * (weights.E ?? 1)),
        W: closed.some(id => id.startsWith('wb-')) ? 0 : (base * (weights.W ?? 1))
    });
  }, [activeLevelId, currentLevel]);
  const cycleCounterRef = useRef(0);
  
  // Interpreter State
  const [programCode, setProgramCode] = useState<string>('');
  const [compiledPhases, setCompiledPhases] = useState<Phase[]>([]);
  const [compiledRules, setCompiledRules] = useState<ConditionalRule[]>([]);
  const [injectedPhase, setInjectedPhase] = useState<PhaseCommand[] | null>(null);
  const [programError, setProgramError] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [userTemplate, setUserTemplate] = useState(() => localStorage.getItem('traffic_user_template') || '');

  const [cmdDir, setCmdDir] = useState<string>('');
  const [cmdTurn, setCmdTurn] = useState<string>('');

  const monaco = useMonaco();
  useEffect(() => {
    if (!editorRef.current || !monaco) return;
    const phase = compiledPhases[currentPhase];
    if (phase && phase.lineStart !== undefined && phase.lineEnd !== undefined) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(phase.lineStart + 1, 1, phase.lineEnd + 1, 1),
          options: {
            isWholeLine: true,
            className: 'bg-[#3FB950]/20 border-l-2 border-[#3FB950]',
          }
        }
      ]);
    } else {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  }, [currentPhase, compiledPhases, executionSplitActive, monaco]);

  const appendCommand = useCallback((action: string) => {
    let cmd = '';
    if (cmdDir === 'CROSSWALK') {
       if (!cmdTurn) return;
       cmd = `CROSSWALK_${cmdTurn}.${action}`;
    } else {
       if (!cmdDir || !cmdTurn) return;
       cmd = `${cmdDir}_${cmdTurn}.${action}`;
    }
    setProgramCode(prev => {
        const trimmed = prev.replace(/\s+$/, '');
        return trimmed + (trimmed ? '\n' : '') + cmd + '\n';
    });
    setCmdTurn('');
  }, [cmdDir, cmdTurn]);

  const appendPhase = useCallback(() => {
    setProgramCode(prev => {
        const trimmed = prev.replace(/\s+$/, '');
        const nextPhase = (prev.match(/phase\(/g) || []).length + 1;
        return trimmed + (trimmed ? '\n\n' : '') + `phase(${nextPhase}):\n`;
    });
  }, []);

  const deleteLastLine = useCallback(() => {
    setProgramCode(prev => {
        const lines = prev.split('\n');
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        if (lines.length > 0) {
            lines.pop();
        }
        return lines.join('\n') + '\n';
    });
  }, []);

  useEffect(() => {
    if (monaco) {
       const provider = monaco.languages.registerCompletionItemProvider('python', {
          provideCompletionItems: () => {
              const suggestions = [
                  ...Object.keys(KEYWORD_MAP).map(k => ({
                      label: `${k}.GO`,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: `${k}.GO`
                  })),
                  ...Object.keys(KEYWORD_MAP).map(k => ({
                      label: `${k}.YIELD`,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: `${k}.YIELD`
                  })),
                  {
                      label: 'phase()',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: 'phase(${1:1}):\n\t$0',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  },
                  {
                      label: 'phase(min, max)',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: 'phase(${1:1}, min=${2:10}, max=${3:20}):\n\t$0',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  }
              ];
              return { suggestions } as any;
          }
       });
       return () => provider.dispose();
    }
  }, [monaco]);

  const saveUserTemplate = () => {
    localStorage.setItem('traffic_user_template', programCode);
    setUserTemplate(programCode);
    addLog("TEMPLATE_SAVED", "var(--green)");
  };

  const compile = useCallback((codeToCompile?: string) => {
    const code = codeToCompile ?? programCode;
    const constraints = currentLevel?.constraints;
    const result = parseTrafficProgram(code, constraints);
    if (result.error) {
      if (programError !== result.error) hapticError();
      setProgramError(result.error);
      setCompiledPhases([]);
      setCompiledRules([]);
      setInjectedPhase(null);
      skipConditionalAfterInjectRef.current = false;
      setLightState('RED');
      setTimer(0);
      return;
    }
    if (result.phases && result.phases.length > 0) {
      setProgramError('');
      setCompiledPhases(result.phases);
      setCompiledRules(result.rules || []);
      const n = result.phases.length;
      setPhaseTimings((prev) =>
        clampPhaseTimingsToLoopCap(
          Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS),
          n,
        ),
      );
      setCurrentPhase(0);
      setInjectedPhase(null);
      skipConditionalAfterInjectRef.current = false;
      setLightState('GREEN');
      setTimer(0);
      return;
    }
    setProgramError('');
    setCompiledPhases([]);
    setCompiledRules([]);
    setInjectedPhase(null);
    skipConditionalAfterInjectRef.current = false;
    setLightState('RED');
    setTimer(0);
  }, [programCode, activeLevelId, currentLevel]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      compile();
    }, 500);
    return () => clearTimeout(timeout);
  }, [compile]);

  const vehiclesRef = useRef<Vehicle[]>([]);
  const forceRareSpawnRef = useRef(false);
  const forceLegendarySpawnRef = useRef(false);
  const laneCarsCacheRef = useRef<Record<string, Vehicle[]>>({});
  const skidMarksRef = useRef<SkidMarkSegment[]>([]);
  const previousRearTiresRef = useRef<Record<string, RearTires>>({});
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);
  const crashDetectedRef = useRef(false);
  const loopUpdateSectionsRef = useRef<Record<string, number>>({});
  const loopDrawSectionsRef = useRef<Record<string, number>>({});
  const loopTotalMsWindowRef = useRef<number[]>([]);
  const loopHudThrottleRef = useRef(0);
  const [bgFontsReady, setBgFontsReady] = useState(false);
  const heatMapRef = useRef<Float32Array>(new Float32Array(HEAT_GRID_COLS * HEAT_GRID_ROWS));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      await document.fonts.load('700 24px "Material Symbols Outlined"');
      if (!cancelled) setBgFontsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    LANES.forEach(l => laneCarsCacheRef.current[l.id] = []);
  }, []);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  const addLog = useCallback((event: string, color?: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    console.log(`[phase] ${time} ${event}`);
    setLogs(prev => [{ id: Math.random().toString(), time, event, color }, ...prev].slice(0, 20));
  }, []);

  const detectCrash = useCallback((vehicles: Vehicle[]): CrashInfo | null => {
    const center = CANVAS_SIZE / 2;
    const intersectionHalf = INTERSECTION_SIZE / 2 + 32;
    const inIntersection = (v: Vehicle) =>
      Math.abs(v.x - center) <= intersectionHalf && Math.abs(v.y - center) <= intersectionHalf;
    const mergePairKey = (laneA: string, laneB: string) =>
      laneA < laneB ? `${laneA}|${laneB}` : `${laneB}|${laneA}`;
    const normalizeAngle = (angle: number) => {
      let a = angle;
      while (a <= -Math.PI) a += Math.PI * 2;
      while (a > Math.PI) a -= Math.PI * 2;
      return a;
    };
    const laneApproachHeading = (lane: Lane | undefined) => {
      if (!lane) return null;
      if (lane.direction === 'N') return -Math.PI / 2;
      if (lane.direction === 'S') return Math.PI / 2;
      if (lane.direction === 'E') return 0;
      return Math.PI;
    };
    const isFollowingPair = (a: Vehicle, b: Vehicle) => {
      const la = LANE_MAP.get(a.laneId);
      const lb = LANE_MAP.get(b.laneId);
      const speedA = Math.hypot(a.vx, a.vy);
      const speedB = Math.hypot(b.vx, b.vy);
      const headingA = speedA > 0.35 ? Math.atan2(a.vy, a.vx) : laneApproachHeading(la) ?? Math.atan2(a.vy, a.vx);
      const headingB = speedB > 0.35 ? Math.atan2(b.vy, b.vx) : laneApproachHeading(lb) ?? Math.atan2(b.vy, b.vx);
      const headingDelta = Math.abs(normalizeAngle(headingA - headingB));
      if (headingDelta > 0.55) return false;

      const avgHeadingX = Math.cos((headingA + headingB) * 0.5);
      const avgHeadingY = Math.sin((headingA + headingB) * 0.5);
      const relX = b.x - a.x;
      const relY = b.y - a.y;
      const longitudinalGap = relX * avgHeadingX + relY * avgHeadingY;
      const lateralGap = Math.abs(relX * -avgHeadingY + relY * avgHeadingX);
      const laneWidthTolerance = Math.max(a.width, b.width) * 1.15;
      const convoyLen = Math.max(a.length, b.length) * 1.25;

      if (
        la &&
        lb &&
        la.direction === lb.direction &&
        la.type === 'THRU' &&
        lb.type === 'THRU' &&
        headingDelta < 0.35 &&
        lateralGap <= laneWidthTolerance &&
        Math.abs(longitudinalGap) <= convoyLen
      ) {
        return true;
      }

      return Math.abs(longitudinalGap) <= convoyLen && lateralGap <= laneWidthTolerance;
    };

    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      if (!inIntersection(a)) continue;
      const speedA = Math.hypot(a.vx, a.vy);
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        if (!inIntersection(b)) continue;
        const speedB = Math.hypot(b.vx, b.vy);
        if (speedA + speedB < 1.2) continue;
        const la = LANE_MAP.get(a.laneId);
        const lb = LANE_MAP.get(b.laneId);
        if (la && lb && la.movement === lb.movement) continue;
        if (a.laneId === b.laneId || isFollowingPair(a, b)) continue;
        if (ADJACENT_RIGHT_MERGE_PAIR_KEYS.has(mergePairKey(a.laneId, b.laneId))) continue;
        if (ADJACENT_LEFT_MERGE_PAIR_KEYS.has(mergePairKey(a.laneId, b.laneId))) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const collisionDist = (Math.max(a.width, a.length) + Math.max(b.width, b.length)) * 0.3;
        if ((dx * dx + dy * dy) <= collisionDist * collisionDist) {
          return {
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
            laneA: a.laneId,
            laneB: b.laneId,
            vehicleIds: [a.id, b.id],
            type: 'COLLISION',
          };
        }
      }
    }
    return null;
  }, []);

  // Initial boot log
  useEffect(() => {
    addLog('SYS BOOT OK', 'var(--green)');
  }, []);

  useEffect(() => {
    const toggleLegendarySpawnTest = () => {
      forceLegendarySpawnRef.current = !forceLegendarySpawnRef.current;
      if (forceLegendarySpawnRef.current) forceRareSpawnRef.current = false;
      addLog(
        forceLegendarySpawnRef.current ? 'LEGENDARY_SPAWN_TEST_ON' : 'LEGENDARY_SPAWN_TEST_OFF',
        forceLegendarySpawnRef.current ? 'var(--yellow)' : 'var(--green)',
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F8') {
        e.preventDefault();
        forceRareSpawnRef.current = !forceRareSpawnRef.current;
        if (forceRareSpawnRef.current) forceLegendarySpawnRef.current = false;
        addLog(
          forceRareSpawnRef.current ? 'RARE_SPAWN_TEST_ON' : 'RARE_SPAWN_TEST_OFF',
          forceRareSpawnRef.current ? 'var(--yellow)' : 'var(--green)',
        );
      }
      if (e.code === 'F9') {
        e.preventDefault();
        toggleLegendarySpawnTest();
      }
      if (e.code === 'KeyL' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        toggleLegendarySpawnTest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addLog]);

  const yieldMovements = useMemo(
    () =>
      injectedPhase
        ? injectedPhase.filter((c) => c.action === 'YIELD').map((c) => c.target)
        : compiledPhases.length > 0
          ? compiledPhases[currentPhase]?.commands.filter((c) => c.action === 'YIELD').map((c) => c.target) || []
          : [],
    [compiledPhases, currentPhase, injectedPhase],
  );

  const activeMovements = useMemo(
    () =>
      injectedPhase
        ? injectedPhase.filter((c) => c.action === 'GO').map((c) => c.target)
        : compiledPhases.length > 0
          ? compiledPhases[currentPhase]?.commands.filter((c) => c.action === 'GO').map((c) => c.target) || []
          : [],
    [compiledPhases, currentPhase, injectedPhase],
  );

  // Accumulate traffic data when phases are active
  useEffect(() => {
    if (!isPlaying || !isAdaptive) return;
    if (compiledPhases.length === 0) return;

    const n = compiledPhases.length;
    if (!cycleDemandRef.current || cycleDemandRef.current.length !== n) {
      cycleDemandRef.current = new Array(n).fill(0);
    }

    const laneCounts = new Map<string, number>();
    vehiclesRef.current.forEach(v => laneCounts.set(v.laneId, (laneCounts.get(v.laneId) || 0) + 1));

    const movementsInPhase = compiledPhases[currentPhase].commands.map((c) => c.target);
    const movementSet = new Set(movementsInPhase);

    let phaseLoad = 0;
    LANES.forEach((l) => {
      if (movementSet.has(l.movement)) {
        phaseLoad += (laneCounts.get(l.id) || 0) + ((offScreenQueues[l.id] || 0) * 1.5);
      }
    });

    cycleDemandRef.current[currentPhase] += phaseLoad;

    // If we just finished the last phase (looped back to 0), apply adjustments!
    if (currentPhase === 0 && lightState === 'RED') {
      cycleCounterRef.current++;

      // Traffic rates should only adjust once per two full phase sequence loops
      // to allow adaptive phase timing to have time to adjust
      if (cycleCounterRef.current % 2 === 0) {
        setTrafficRates(prev => {
          if (currentLevel?.isSandbox) return prev;
          const next = { ...prev };
          const closed = currentLevel?.closedLanes || [];
          Object.keys(next).forEach(dir => {
            const isClosed = closed.some(id => id.startsWith(dir.toLowerCase() + 'b-'));
            if (isClosed) {
              next[dir] = 0;
              return;
            }
            const drift = (prngRef.current.next() - 0.5) * SPAWN_DRIFT_SPEED;
            next[dir] = Math.max(0.01, Math.min(0.2, next[dir] + drift));
          });
          return next;
        });
      }

      setPhaseTimings((prev) => {
        // calculate new targets based on total accumulated load over the cycle
        const next = Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS);
        
        // Calculate target green times based on weighted proportion of the loop
        const totalLoad = cycleDemandRef.current.reduce((a,b) => a + b, 0);
        const availableGreen = MAX_TOTAL_LOOP_SECONDS - (n * MIN_PHASE_GREEN_SECONDS);

        const newTimings = next.map((_, i) => {
          const loadRatio = totalLoad > 0 ? cycleDemandRef.current[i] / totalLoad : 1/n;
          return MIN_PHASE_GREEN_SECONDS + Math.round(loadRatio * availableGreen);
        });

        // Reset our cycle accumulator
        cycleDemandRef.current = new Array(n).fill(0);

        // Refine/Smooth the changes by 40% so it doesnt snap instantly
        return newTimings.map((target, i) => {
          const diff = target - next[i];
          let smoothed = next[i] + Math.round(diff * 0.4);
          
          if (compiledPhases[i]) {
            if (compiledPhases[i].minDuration !== undefined) {
              smoothed = Math.max(smoothed, compiledPhases[i].minDuration);
            }
            if (compiledPhases[i].maxDuration !== undefined) {
              smoothed = Math.min(smoothed, compiledPhases[i].maxDuration);
            }
          }
          return smoothed;
        });
      });
    }

  }, [currentPhase, lightState, isAdaptive, isPlaying, offScreenQueues, compiledPhases, activeLevelId, currentLevel]);

  // Record History for Charts
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        
        setTimingHistory(prev => {
            const entry = {
                time: timestamp,
                P1: phaseTimings[0] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P2: phaseTimings[1] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P3: phaseTimings[2] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P4: phaseTimings[3] ?? DEFAULT_PHASE_GREEN_SECONDS,
            };
            return [...prev, entry].slice(-20);
        });

        setQueueHistory(prev => {
            const entry: QueueHistoryEntry = { time: timestamp };
            LANES.forEach(lane => {
                entry[lane.id] = offScreenQueues[lane.id] || 0;
            });
            return [...prev, entry].slice(-20);
        });
    }, 2000 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, phaseTimings, offScreenQueues, timeScale]);

  // 1. Timer update interval
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimer(prev => prev + 0.1 * timeScale);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, timeScale]);

  // 2. Traffic light state transition logic
  useEffect(() => {
    if (!isPlaying) return;
    if (compiledPhases.length === 0) {
      if (lightState !== 'RED') {
        setLightState('RED');
        setTimer(0);
      }
      return;
    }

    const sc = compiledPhases.length;
    const idx = currentPhase % sc;
    const currentMaxGreen = injectedPhase ? MIN_PHASE_GREEN_SECONDS : (phaseTimings[idx] ?? DEFAULT_PHASE_GREEN_SECONDS);

    if (lightState === 'GREEN' && timer >= currentMaxGreen) {
      setLightState('YELLOW');
      addLog(`${formatActiveMovements(activeMovements)} YELLOW`, 'var(--yellow)');
      setTimer(0);
    } else if (lightState === 'YELLOW' && timer >= DEFAULT_TIMINGS.yellow) {
      setLightState('RED');
      addLog('ALL RED WAIT', 'var(--red)');
      setTimer(0);
    } else if (lightState === 'RED' && timer >= DEFAULT_TIMINGS.allRed) {
      let matchedRule: ConditionalRule | null = null;
      if (!injectedPhase && !skipConditionalAfterInjectRef.current) {
        for (const rule of compiledRules) {
           if ((offScreenQueues[rule.targetLaneId] || 0) > rule.threshold) {
               matchedRule = rule;
               break;
           }
        }
      }

      if (matchedRule) {
          setInjectedPhase(matchedRule.insertCommands);
          setLightState('GREEN');
          addLog('SENSOR OVERRIDE ACTIVE', 'var(--major)');
          setTimer(0);
      } else {
          const hadInjection = !!injectedPhase;
          const nextPhaseIndex = (currentPhase + (injectedPhase ? 0 : 1)) % compiledPhases.length;
          const nextMovements = compiledPhases[nextPhaseIndex]?.commands.map((c) => c.target) || [];
          setInjectedPhase(null);
          setLightState('GREEN');
          setCurrentPhase(nextPhaseIndex);
          addLog(`${formatActiveMovements(nextMovements)} START`, 'var(--major)');
          setTimer(0);
          if (hadInjection) {
            skipConditionalAfterInjectRef.current = true;
          } else if (skipConditionalAfterInjectRef.current) {
            skipConditionalAfterInjectRef.current = false;
          }
      }
    }
  }, [timer, isPlaying, lightState, currentPhase, phaseTimings, activeMovements, compiledPhases, compiledRules, injectedPhase, offScreenQueues, addLog]);

  // 1. TRAFFIC GENERATOR (PRODUCER)
  // This only calculates demand and adds it to the off-screen queue.
  // It NO LONGER spawns cars directly or checks road distance.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setOffScreenQueues(prev => {
        const next = { ...prev };
        let changed = false;
        /* currentLevel mapped by useMemo */
        LANES.forEach(lane => {
          if (currentLevel?.closedLanes?.includes(lane.id)) return;
          const rate = trafficRates[lane.direction];
          // If random roll succeeds, add a car to this lane's queue
          if (prngRef.current.next() < rate) {
            next[lane.id] = (next[lane.id] || 0) + 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, trafficRates, timeScale, activeLevelId, currentLevel]);

  // 2. QUEUE DRAINER / SPAWNER (CONSUMER)
  // This is the ONLY place where cars are spawned onto the canvas.
  // It checks if there's space and moves a car from the queue to the road.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setOffScreenQueues(prev => {
        const next = { ...prev };
        let changed = false;
        /* currentLevel mapped by useMemo */
        const laneCars = new Map<string, Vehicle[]>();
        vehiclesRef.current.forEach(v => {
          let arr = laneCars.get(v.laneId);
          if (!arr) {
            arr = [];
            laneCars.set(v.laneId, arr);
          }
          arr.push(v);
        });
        
        LANES.forEach(lane => {
          if (currentLevel?.closedLanes?.includes(lane.id)) return;
          // Only attempt to spawn if there's a backlog
          if (next[lane.id] > 0) {
            const carsInLane = laneCars.get(lane.id) || [];
            
            // Find distance to the closest car in this lane
            const edgeDistSq = carsInLane.reduce((minDistSq, v) => {
              const dx = v.x - lane.startX;
              const dy = v.y - lane.startY;
              const dSq = dx * dx + dy * dy;
              return dSq < minDistSq ? dSq : minDistSq;
            }, Infinity);

            // Logic optimization: If the car ahead is moving, reduce the required distance to enter
            const currentLaneSpeed = carsInLane.length > 0 ? Math.abs(carsInLane[0].vy || carsInLane[0].vx) : 0;
            
            const r = prngRef.current.next();
            let spec = vehicleCatalog.defaultSpawn;
            for (let si = 0; si < vehicleCatalog.spawnRollOrder.length; si++) {
              const row = vehicleCatalog.spawnRollOrder[si];
              if (r < row.rLessThan) {
                spec = row;
                break;
              }
            }
            const vType = spec.vType as VehicleType;
            const width = spec.width;
            const length = spec.length;
            const cruiseSpeed = spec.cruiseSpeedMin + prngRef.current.next() * (spec.cruiseSpeedMax - spec.cruiseSpeedMin);
            const accel = spec.accel;
            const decel = spec.decel;

            let legendarySkin = false;
            let rareSkin = false;
            if (forceLegendarySpawnRef.current) {
              legendarySkin = true;
            } else if (forceRareSpawnRef.current) {
              rareSkin = true;
            } else {
              legendarySkin = prngRef.current.next() < LEGENDARY_SPAWN_CHANCE;
              rareSkin = !legendarySkin && prngRef.current.next() < 0.01;
            }

            const safeDist = BASE_SAFE_GAP + length / 2 + (carsInLane[0]?.length || 30) / 2;
            const dynamicEntryDist = currentLaneSpeed > 1 ? safeDist * 0.6 : safeDist;

            // If the entrance is clear (dynamic), move car from queue to road
            if (edgeDistSq > dynamicEntryDist * dynamicEntryDist) {
              const startAngle = lane.direction === 'N' ? -Math.PI/2 : lane.direction === 'S' ? Math.PI/2 : lane.direction === 'E' ? 0 : Math.PI;
              const colorIdx = Math.floor(((cruiseSpeed - 1.5) / 2.5) * VEHICLE_COLORS.length);
              const color = VEHICLE_COLORS[Math.max(0, Math.min(VEHICLE_COLORS.length - 1, colorIdx))];

              const newVehicle: Vehicle = {
                id: Math.random().toString(36).substr(2, 9),
                vType,
                legendarySkin,
                rareSkin,
                accel,
                decel,
                x: lane.startX,
                y: lane.startY,
                vx: 0,
                vy: 0,
                angle: startAngle,
                laneId: lane.id,
                color: color,
                width,
                length,
                cruiseSpeed: cruiseSpeed,
                startDelay: 0.1 + prngRef.current.next() * 0.3,
                spawnAtMs: performance.now(),
                originDir: lane.direction,
              };

              vehiclesRef.current.push(newVehicle);
              next[lane.id]--; // Decrement the overflow count
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
    }, 150 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, timeScale, activeLevelId, currentLevel]);

  const update = useCallback((time: number, simStep: number) => {
    const u = loopUpdateSectionsRef.current;
    for (const k of Object.keys(u)) delete u[k];
    let m = performance.now();

    const vehicles = vehiclesRef.current;
    const nextRearTires: Record<string, RearTires> = {};
    const heatMap = heatMapRef.current;
    for (let i = 0; i < heatMap.length; i++) {
      heatMap[i] *= Math.pow(HEATMAP_DECAY, simStep);
    }
    u.heatDecay = performance.now() - m;
    m = performance.now();
    
    const laneCars = laneCarsCacheRef.current;
    for (const k in laneCars) laneCars[k].length = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (laneCars[v.laneId]) laneCars[v.laneId].push(v);
    }
    u.bucketLanes = performance.now() - m;
    m = performance.now();

    vehicles.forEach((v) => {
      const lane = LANE_MAP.get(v.laneId)!;
      const isYield = yieldMovements.includes(lane.movement);
      const isGreen = (activeMovements.includes(lane.movement) || isYield) && lightState === 'GREEN';
      const isYellow = (activeMovements.includes(lane.movement) || isYield) && lightState === 'YELLOW';
      
      // Target Speed
      let targetSpeed = v.cruiseSpeed;
      if ((time - v.spawnAtMs) * timeScaleRef.current < v.startDelay * 1000) {
        targetSpeed = 0;
      }
      
      // Distance to intersection stop line
      let distToStop = Infinity;
      if (lane.direction === 'N') distToStop = v.y - (CANVAS_SIZE / 2 + STOP_LINE);
      if (lane.direction === 'S') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.y;
      if (lane.direction === 'E') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.x;
      if (lane.direction === 'W') distToStop = v.x - (CANVAS_SIZE / 2 + STOP_LINE);

      // Light logic
      let mustStopForLight = false;
      if (!isGreen) { // Normal Red/Yellow stop check
        if (distToStop > 0 && distToStop < 100) {
          if (!isYellow || distToStop > 40) {
            mustStopForLight = true;
          }
        }
      }

      // Yield Check (Applies to both Green and moving on Yellow)
      if (!mustStopForLight && isYield && distToStop > -20 && distToStop < 40) {
        let conflictingLaneIds: string[] = [];
        if (lane.type === 'LEFT') {
          const oncoming =
            lane.direction === 'N'
              ? ['sb-thru', 'sb-right']
              : lane.direction === 'S'
                ? ['nb-thru', 'nb-right']
                : lane.direction === 'E'
                  ? ['wb-thru', 'wb-right']
                  : ['eb-thru', 'eb-right'];
          conflictingLaneIds = [...oncoming, ...LEFT_LANE_IDS.filter((id) => id !== lane.id)];
        } else if (lane.type === 'RIGHT') {
          if (lane.direction === 'N') conflictingLaneIds = ['wb-thru', 'wb-right', 'sb-left'];
          if (lane.direction === 'S') conflictingLaneIds = ['eb-thru', 'eb-right', 'nb-left'];
          if (lane.direction === 'E') conflictingLaneIds = ['nb-thru', 'nb-right', 'wb-left'];
          if (lane.direction === 'W') conflictingLaneIds = ['sb-thru', 'sb-right', 'eb-left'];
        } else if (lane.type === 'THRU') {
          if (lane.direction === 'N' || lane.direction === 'S') {
            conflictingLaneIds = LANES.filter((l) => l.direction === 'E' || l.direction === 'W').map((l) => l.id);
          } else {
            conflictingLaneIds = LANES.filter((l) => l.direction === 'N' || l.direction === 'S').map((l) => l.id);
          }
        }

        for (const conflictingLaneId of conflictingLaneIds) {
          const oncoming = laneCars[conflictingLaneId] || [];
          for (const other of oncoming) {
            let otherDistToStop = Infinity;
            if (conflictingLaneId.startsWith('sb-')) otherDistToStop = (CANVAS_SIZE / 2 - STOP_LINE) - other.y;
            if (conflictingLaneId.startsWith('nb-')) otherDistToStop = other.y - (CANVAS_SIZE / 2 + STOP_LINE);
            if (conflictingLaneId.startsWith('wb-')) otherDistToStop = other.x - (CANVAS_SIZE / 2 + STOP_LINE);
            if (conflictingLaneId.startsWith('eb-')) otherDistToStop = (CANVAS_SIZE / 2 - STOP_LINE) - other.x;

            if (otherDistToStop > -80 && otherDistToStop < 220) {
              const otherSpeed = Math.abs(other.vx) + Math.abs(other.vy);
              const isMoving = otherSpeed > 0.5;
              const isStuckInIntersection = !isMoving && otherDistToStop > -80 && otherDistToStop <= 0;
              const nearContest =
                distToStop < 50 && otherDistToStop > -20 && otherDistToStop < 50;
              if (
                otherDistToStop <= 0 ||
                isStuckInIntersection ||
                (isMoving && otherDistToStop < 220) ||
                (nearContest &&
                  (otherDistToStop < distToStop - 2 ||
                    (Math.abs(otherDistToStop - distToStop) <= 3 &&
                      v.laneId.localeCompare(conflictingLaneId) > 0)))
              ) {
                mustStopForLight = true;
                break;
              }
            }
          }
          if (mustStopForLight) break;
        }
      }

      if (mustStopForLight) {
        targetSpeed = 0;
      }

      // Car following logic
      let carAhead: Vehicle | undefined = undefined;
      const candidates = v.isTurning ? vehicles : (laneCars[v.laneId] || []);
      for (let i = 0; i < candidates.length; i++) {
        const other = candidates[i];
        if (other.id === v.id) continue;
        if (other.laneId !== v.laneId && !(v.isTurning && other.isTurning)) continue;

        const safeDist = BASE_SAFE_GAP + v.length / 2 + other.length / 2;

        if (v.isTurning && other.isTurning) {
          const dx = other.x - v.x;
          const dy = other.y - v.y;
          const distSq = dx * dx + dy * dy;

          if (other.laneId === v.laneId) {
            if (distSq < safeDist * safeDist && (other.turnProgress ?? 0) > (v.turnProgress ?? 0)) {
              carAhead = other;
              break;
            }
          } else {
            if (distSq < (safeDist * 0.7) * (safeDist * 0.7)) {
              // Tie-breaker to prevent symmetric deadlocks when turns cross paths
              if (v.id < other.id) {
                carAhead = other;
                break;
              }
            }
          }
          continue;
        }

        if (lane.direction === 'N' && other.y < v.y && (v.y - other.y) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'S' && other.y > v.y && (other.y - v.y) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'E' && other.x > v.x && (other.x - v.x) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'W' && other.x < v.x && (v.x - other.x) < safeDist) { carAhead = other; break; }
      }

      if (carAhead) {
        const safeDist = BASE_SAFE_GAP + v.length / 2 + carAhead.length / 2;
        const dx = carAhead.x - v.x;
        const dy = carAhead.y - v.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const otherSpeed = Math.sqrt(carAhead.vx * carAhead.vx + carAhead.vy * carAhead.vy);
        
        if (dist < safeDist * 0.7) {
          targetSpeed = Math.min(targetSpeed, otherSpeed * 0.5);
        } else {
          targetSpeed = Math.min(targetSpeed, otherSpeed);
        }
        if (targetSpeed < 0.1) targetSpeed = 0;
      }

      // Physics
      const currentSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      let accel = 0;
      if (currentSpeed < targetSpeed) accel = v.accel;
      else if (currentSpeed > targetSpeed) accel = -v.decel;

      const newSpeed = Math.max(0, currentSpeed + accel * simStep);
      
      if (newSpeed < currentSpeed - 0.001) {
          v.brakeIntensity = Math.min(1, (currentSpeed - newSpeed) / v.decel);
      } else {
          v.brakeIntensity = 0;
      }
      const isStopped = newSpeed < 0.1;
      const heatLoad = (isStopped ? 1 : 0) + (v.brakeIntensity || 0);
      if (heatLoad > 0) {
        const gridX = Math.max(0, Math.min(HEAT_GRID_COLS - 1, Math.floor((v.x / CANVAS_SIZE) * HEAT_GRID_COLS)));
        const gridY = Math.max(0, Math.min(HEAT_GRID_ROWS - 1, Math.floor((v.y / CANVAS_SIZE) * HEAT_GRID_ROWS)));
        const heatIndex = gridY * HEAT_GRID_COLS + gridX;
        heatMap[heatIndex] = Math.min(HEATMAP_MAX, heatMap[heatIndex] + heatLoad * HEATMAP_GAIN);
      }
      
      if (newSpeed > 0.1) {
          v.angle = Math.atan2(v.vy, v.vx);
      }
      
      // Turning logic
      if (!v.isTurning) {
        const inIntersection = Math.abs(v.x - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2 && Math.abs(v.y - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2;
        if (inIntersection) {
            const centerX = CANVAS_SIZE / 2;
            const centerY = CANVAS_SIZE / 2;
            let shouldStart = false;

            if (lane.type === 'LEFT' || lane.type === 'RIGHT') {
                let crossed = false;
                if (lane.direction === 'N' && v.y <= centerY + 120) crossed = true;
                else if (lane.direction === 'S' && v.y >= centerY - 120) crossed = true;
                else if (lane.direction === 'E' && v.x >= centerX - 120) crossed = true;
                else if (lane.direction === 'W' && v.x <= centerX + 120) crossed = true;

                if (crossed) {
                    const geom = getPathGeometry(lane, centerX, centerY);
                    if (geom.type === 'ARC') {
                        v.turnCenterX = geom.centerX;
                        v.turnCenterY = geom.centerY;
                        v.turnRadius = geom.radius;
                        v.turnAngleStart = geom.startAngle;
                        v.turnAngleEnd = geom.endAngle;
                        shouldStart = true;
                    }
                }
            }

            if (shouldStart) {
                v.isTurning = true;
                v.turnProgress = 0;
            }
        }
      }

      if (v.isTurning) {
          const angularSpeed = newSpeed / v.turnRadius!;
          v.turnProgress = Math.min(1, v.turnProgress! + (angularSpeed / (Math.PI / 2)) * simStep);
          
          const currentAngle = v.turnAngleStart! + (v.turnAngleEnd! - v.turnAngleStart!) * v.turnProgress;
          v.x = v.turnCenterX! + v.turnRadius! * Math.cos(currentAngle);
          v.y = v.turnCenterY! + v.turnRadius! * Math.sin(currentAngle);
          
          // Tangent direction for visual angle
          const tangentAngle = currentAngle + (v.turnAngleEnd! > v.turnAngleStart! ? Math.PI/2 : -Math.PI/2);
          v.vx = Math.cos(tangentAngle) * newSpeed;
          v.vy = Math.sin(tangentAngle) * newSpeed;
          v.angle = tangentAngle;

          if (v.turnProgress >= 1) {
              v.isTurning = false;
              // Set final velocity based on exit direction and HANDOVER to new laneId
              if (lane.type === 'LEFT') {
                  if (lane.direction === 'N') { v.vx = -newSpeed; v.vy = 0; v.laneId = 'wb-left'; }
                  if (lane.direction === 'S') { v.vx = newSpeed; v.vy = 0; v.laneId = 'eb-left'; }
                  if (lane.direction === 'E') { v.vx = 0; v.vy = -newSpeed; v.laneId = 'nb-left'; }
                  if (lane.direction === 'W') { v.vx = 0; v.vy = newSpeed; v.laneId = 'sb-left'; }
              } else {
                  // RIGHT
                  if (lane.direction === 'N') { v.vx = newSpeed; v.vy = 0; v.laneId = 'eb-right'; }
                  if (lane.direction === 'S') { v.vx = -newSpeed; v.vy = 0; v.laneId = 'wb-right'; }
                  if (lane.direction === 'E') { v.vx = 0; v.vy = newSpeed; v.laneId = 'sb-right'; }
                  if (lane.direction === 'W') { v.vx = 0; v.vy = -newSpeed; v.laneId = 'nb-right'; }
              }
          }
      } else {
          if (lane.direction === 'N') { v.vy = -newSpeed; v.vx = 0; }
          if (lane.direction === 'S') { v.vy = newSpeed; v.vx = 0; }
          if (lane.direction === 'E') { v.vx = newSpeed; v.vy = 0; }
          if (lane.direction === 'W') { v.vx = -newSpeed; v.vy = 0; }

          v.x += v.vx * simStep;
          v.y += v.vy * simStep;
      }

      const currentRearTires = getRearTirePositions(v);
      const previousRearTires = previousRearTiresRef.current[v.id];
      if (previousRearTires && (v.brakeIntensity || 0) > SKID_MARK_BRAKE_THRESHOLD) {
        const segmentWidth = Math.max(0.9, v.width * 0.12);
        const baseAlpha = 0.18 + ((v.brakeIntensity || 0) - SKID_MARK_BRAKE_THRESHOLD) * 0.34;
        skidMarksRef.current.push(
          { from: previousRearTires.left, to: currentRearTires.left, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha, width: segmentWidth },
          { from: previousRearTires.right, to: currentRearTires.right, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha, width: segmentWidth },
        );
      }
      nextRearTires[v.id] = currentRearTires;
    });
    u.vehicleSim = performance.now() - m;
    m = performance.now();

    let validCount = 0;
    let newlyCleared = 0;
    const newlyClearedDirs: Record<string, number> = { N: 0, S: 0, E: 0, W: 0 };
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.x >= -50 && v.x <= CANVAS_SIZE + 50 && v.y >= -50 && v.y <= CANVAS_SIZE + 50) {
        vehicles[validCount++] = v;
      } else {
        newlyCleared++;
        newlyClearedDirs[v.originDir]++;
      }
    }
    vehicles.length = validCount;
    if (newlyCleared > 0) {
      setSessionCarsCleared(prev => prev + newlyCleared);
      setSessionCarsByDir(prev => ({
        N: prev.N + newlyClearedDirs.N,
        S: prev.S + newlyClearedDirs.S,
        E: prev.E + newlyClearedDirs.E,
        W: prev.W + newlyClearedDirs.W,
      }));
    }
    const filteredRearTires: Record<string, RearTires> = {};
    for (let i = 0; i < vehicles.length; i++) {
      const vehicleId = vehicles[i].id;
      const tires = nextRearTires[vehicleId];
      if (tires) filteredRearTires[vehicleId] = tires;
    }
    previousRearTiresRef.current = filteredRearTires;
    skidMarksRef.current = skidMarksRef.current.filter(
      (segment) => (time - segment.bornAt) * timeScaleRef.current < segment.ttlMs,
    );
    if (skidMarksRef.current.length > MAX_SKID_MARK_SEGMENTS) {
      skidMarksRef.current.splice(0, skidMarksRef.current.length - MAX_SKID_MARK_SEGMENTS);
    }
    if (!crashDetectedRef.current) {
      const collision = detectCrash(vehicles);
      if (collision) {
        crashDetectedRef.current = true;
        setCrashInfo(collision);
        setSessionCrashes(prev => prev + 1);
        setIsCrashModalMinimized(false);
        isPlayingRef.current = false;
        setIsPlaying(false);
        addLog('CRASH DETECTED', 'var(--red)');
        hapticCrash();
      }
    }
    u.cullSkid = performance.now() - m;
  }, [activeMovements, lightState, addLog, detectCrash]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    const d = loopDrawSectionsRef.current;
    for (const k of Object.keys(d)) delete d[k];
    let md = performance.now();

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    d.clear = performance.now() - md;
    md = performance.now();

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;

    /* currentLevel mapped by useMemo */
    const closedDirections = new Set<string>();
    if (currentLevel?.closedLanes) {
      currentLevel.closedLanes.forEach(laneId => {
        if (laneId.startsWith('nb-')) closedDirections.add('N');
        if (laneId.startsWith('sb-')) closedDirections.add('S');
        if (laneId.startsWith('eb-')) closedDirections.add('E');
        if (laneId.startsWith('wb-')) closedDirections.add('W');
      });
    }

    const drawBgGlyphLayer = (c: CanvasRenderingContext2D) => {
      const drawRoadArrow = (x: number, y: number, angle: number, icon: string) => {
        c.save();
        c.translate(x, y);
        c.rotate(angle);
        c.fillStyle = 'rgba(88, 166, 255, 0.3)';
        c.font = '700 24px "Material Symbols Outlined"';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(icon, 0, 0);
        c.restore();
      };

      const drawStaticLabel = (label: string, x: number, y: number) => {
        c.fillStyle = 'rgba(88, 166, 255, 0.6)';
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.font = 'bold 10px "JetBrains Mono"';
        c.fillText(label, x, y);
      };

      drawStaticLabel('APP_N_01 [INBOUND]', centerX + INTERSECTION_SIZE / 2 + 20, CANVAS_SIZE - 60);
      drawStaticLabel('APP_S_01 [INBOUND]', centerX - INTERSECTION_SIZE / 2 - 140, 40);
      drawStaticLabel('APP_E_01 [INBOUND]', 40, centerY + INTERSECTION_SIZE / 2 + 20);
      drawStaticLabel('APP_W_01 [INBOUND]', CANVAS_SIZE - 160, centerY - INTERSECTION_SIZE / 2 - 40);

      drawRoadArrow(centerX + 20, centerY + 170, 0, 'turn_left');
      drawRoadArrow(centerX + 60, centerY + 170, 0, 'arrow_upward');
      drawRoadArrow(centerX + 100, centerY + 170, 0, 'turn_right');
      drawRoadArrow(centerX - 20, centerY - 170, Math.PI, 'turn_left');
      drawRoadArrow(centerX - 60, centerY - 170, Math.PI, 'arrow_upward');
      drawRoadArrow(centerX - 100, centerY - 170, Math.PI, 'turn_right');
      drawRoadArrow(centerX - 170, centerY + 20, Math.PI/2, 'turn_left');
      drawRoadArrow(centerX - 170, centerY + 60, Math.PI/2, 'arrow_upward');
      drawRoadArrow(centerX - 170, centerY + 100, Math.PI/2, 'turn_right');
      drawRoadArrow(centerX + 170, centerY - 20, -Math.PI/2, 'turn_left');
      drawRoadArrow(centerX + 170, centerY - 60, -Math.PI/2, 'arrow_upward');
      drawRoadArrow(centerX + 170, centerY - 100, -Math.PI/2, 'turn_right');
    };

    ctx.fillStyle = '#0D0F12';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Blueprint Grid Overlay
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= CANVAS_SIZE; i += 20) {
      ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_SIZE);
      ctx.moveTo(0, i); ctx.lineTo(CANVAS_SIZE, i);
    }
    ctx.stroke();
    
    // Major Grid Lines
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.1)';
    ctx.beginPath();
    for (let i = 0; i <= CANVAS_SIZE; i += 100) {
      ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_SIZE);
      ctx.moveTo(0, i); ctx.lineTo(CANVAS_SIZE, i);
    }
    ctx.stroke();

    const drawConstructionCone = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Base
      ctx.fillStyle = '#FF6B00';
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.lineTo(6, 6);
      ctx.lineTo(5, 4);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.moveTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.lineTo(1, -8);
      ctx.lineTo(-1, -8);
      ctx.closePath();
      ctx.fill();

      // White stripe
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-2, -2, 4, 3);
      
      ctx.restore();
    };

    if (currentLevel?.closedLanes) {
      currentLevel.closedLanes.forEach(laneId => {
        const lane = LANE_MAP.get(laneId);
        if (!lane) return;
        
        // Draw 3 cones in a row across the lane near the stop line
        for (let i = -1; i <= 1; i++) {
          let coneX = lane.startX;
          let coneY = lane.startY;
          
          if (lane.direction === 'N' || lane.direction === 'S') {
            coneX = lane.startX + i * (LANE_WIDTH / 3);
            coneY = lane.direction === 'N' ? centerY + STOP_LINE + 10 : centerY - STOP_LINE - 10;
          } else {
            coneX = lane.direction === 'E' ? centerX - STOP_LINE - 10 : centerX + STOP_LINE + 10;
            coneY = lane.startY + i * (LANE_WIDTH / 3);
          }
          drawConstructionCone(coneX, coneY);
        }
      });
    }

    ctx.fillStyle = 'rgba(26, 29, 35, 0.5)';
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, 0, INTERSECTION_SIZE, CANVAS_SIZE);
    ctx.fillRect(0, centerY - INTERSECTION_SIZE / 2, CANVAS_SIZE, INTERSECTION_SIZE);
    ctx.fillStyle = '#0D0F12';
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, centerY - INTERSECTION_SIZE / 2, INTERSECTION_SIZE, INTERSECTION_SIZE);
    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;

    const drawLaneMarkers = (x: number, y: number, length: number, horizontal: boolean) => {
      if (horizontal) {
        ctx.moveTo(x, y); ctx.lineTo(x + length, y);
      } else {
        ctx.moveTo(x, y); ctx.lineTo(x, y + length);
      }
    };

    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#444c56';
    ctx.beginPath();
    ctx.moveTo(centerX - 2, 0); ctx.lineTo(centerX - 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + 2, 0); ctx.lineTo(centerX + 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX - 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX - 2, CANVAS_SIZE);
    ctx.moveTo(centerX + 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX + 2, CANVAS_SIZE);
    ctx.moveTo(0, centerY - 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY - 2);
    ctx.moveTo(0, centerY + 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY + 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY - 2); ctx.lineTo(CANVAS_SIZE, centerY - 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY + 2); ctx.lineTo(CANVAS_SIZE, centerY + 2);
    ctx.stroke();

    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    [LANE_WIDTH, LANE_WIDTH * 2].forEach(offset => {
      drawLaneMarkers(centerX + offset, 0, centerY - INTERSECTION_SIZE / 2, false);
      drawLaneMarkers(centerX - offset, 0, centerY - INTERSECTION_SIZE / 2, false);
      drawLaneMarkers(centerX + offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
      drawLaneMarkers(centerX - offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
      drawLaneMarkers(0, centerY + offset, centerX - INTERSECTION_SIZE / 2, true);
      drawLaneMarkers(0, centerY - offset, centerX - INTERSECTION_SIZE / 2, true);
      drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY + offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
      drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY - offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
    });
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2D333B';
    ctx.beginPath();
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY - STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY - STOP_LINE);
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY + STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY + STOP_LINE);
    ctx.moveTo(centerX - STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX - STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX + STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.stroke();

    if (bgFontsReady) {
      drawBgGlyphLayer(ctx);
    }
    d.bgBase = performance.now() - md;
    md = performance.now();

    const drawIntersectionPaths = () => {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);

      LANES.forEach((lane) => {
        const isActive = activeMovements.includes(lane.movement) && (lightState === 'GREEN' || lightState === 'YELLOW');
        ctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.05)';
        
        const geom = getPathGeometry(lane, centerX, centerY);
        ctx.beginPath();
        if (geom.type === 'STRAIGHT') {
          ctx.moveTo(geom.startX, geom.startY);
          ctx.lineTo(geom.endX, geom.endY);
        } else if (geom.type === 'ARC') {
          ctx.arc(geom.centerX, geom.centerY, geom.radius, geom.startAngle, geom.endAngle, geom.counterClockwise);
        }
        ctx.stroke();
      });

      ctx.restore();
    };

    drawIntersectionPaths();
    d.paths = performance.now() - md;
    md = performance.now();

    if (showHeatmap) {
      const cellWidth = CANVAS_SIZE / HEAT_GRID_COLS;
      const cellHeight = CANVAS_SIZE / HEAT_GRID_ROWS;
      const heatMap = heatMapRef.current;
      for (let y = 0; y < HEAT_GRID_ROWS; y++) {
        for (let x = 0; x < HEAT_GRID_COLS; x++) {
          const heat = heatMap[y * HEAT_GRID_COLS + x];
          if (heat <= 0.08) continue;
          const t = Math.max(0, Math.min(1, heat / HEATMAP_MAX));
          const red = Math.round(255 * t);
          const green = Math.round(255 * (1 - t));
          const alpha = 0.08 + t * 0.37;
          ctx.fillStyle = `rgba(${red}, ${green}, 0, ${alpha})`;
          ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        }
      }
    }
    d.heatmap = performance.now() - md;
    md = performance.now();

    if (skidMarksRef.current.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < skidMarksRef.current.length; i++) {
        const segment = skidMarksRef.current[i];
        const ageRatio = ((time - segment.bornAt) * timeScaleRef.current) / segment.ttlMs;
        const alpha = segment.baseAlpha * (1 - Math.min(1, ageRatio));
        if (alpha <= 0) continue;
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
        ctx.lineWidth = segment.width;
        ctx.beginPath();
        ctx.moveTo(segment.from.x, segment.from.y);
        ctx.lineTo(segment.to.x, segment.to.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    d.skidMarks = performance.now() - md;
    md = performance.now();

    const drawSignal = (x: number, y: number, angle: number, movements: Movement[], isLeft: boolean = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const isActive = movements.some(m => activeMovements.includes(m));
      const isYield = movements.some(m => yieldMovements.includes(m));
      let currentHeadState = 'RED';
      if (isActive) currentHeadState = lightState;
      else if (isYield && lightState === 'GREEN') currentHeadState = 'FLASHING_YELLOW';
      else if (isYield && lightState === 'YELLOW') currentHeadState = 'YELLOW';

      // Housing
      ctx.fillStyle = '#1A1D23';
      ctx.strokeStyle = '#2D333B';
      ctx.lineWidth = 1;
      
      const housingWidth = 16;
      const housingHeight = 46;
      ctx.fillRect(-housingWidth / 2, -housingHeight / 2, housingWidth, housingHeight);
      ctx.strokeRect(-housingWidth / 2, -housingHeight / 2, housingWidth, housingHeight);

      // Lights positions (Flip order for horizontal signals as per user request)
      const isHorizontal = Math.abs(angle % Math.PI) > 0.1 && Math.abs(angle % Math.PI) < Math.PI - 0.1;

      const drawLight = (state: string, color: string, offColor: string, posY: number) => {
        let isOn = currentHeadState === state;
        if (state === 'YELLOW' && currentHeadState === 'FLASHING_YELLOW') {
            isOn = Math.floor(time / Math.max(100, 500 / timeScaleRef.current)) % 2 === 0;
        }
        ctx.fillStyle = isOn ? color : offColor;
        ctx.beginPath();
        ctx.arc(0, posY, 5, 0, Math.PI * 2);
        ctx.fill();

        if (isOn) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(0, posY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        if (isLeft) {
            // Draw small arrow inside the light
            ctx.strokeStyle = isOn ? '#FFFFFF' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(1.5, posY); ctx.lineTo(-1.5, posY);
            ctx.lineTo(0.5, posY - 2); ctx.moveTo(-1.5, posY);
            ctx.lineTo(0.5, posY + 2);
            ctx.stroke();
        }
      };

      drawLight('RED', '#F85149', '#301010', isHorizontal ? 14 : -14);
      drawLight('YELLOW', '#D29922', '#201800', 0);
      drawLight('GREEN', '#3FB950', '#001800', isHorizontal ? -14 : 14);

      ctx.restore();
    };

    const drawDynamicQueue = (prefix: string, x: number, y: number) => {
      const qL = offScreenQueues[prefix + '-left'] || 0;
      const qT = offScreenQueues[prefix + '-thru'] || 0;
      const qR = offScreenQueues[prefix + '-right'] || 0;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '12px "JetBrains Mono"';
      ctx.fillStyle = (qL > 0 || qT > 0 || qR > 0) ? '#FFFFFF' : '#8B949E';
      ctx.fillText(`L:+${qL} T:+${qT} R:+${qR}`, x, y + 16);
    };

    drawDynamicQueue('nb', centerX + INTERSECTION_SIZE / 2 + 20, CANVAS_SIZE - 60);
    drawDynamicQueue('sb', centerX - INTERSECTION_SIZE / 2 - 140, 40);
    drawDynamicQueue('eb', 40, centerY + INTERSECTION_SIZE / 2 + 20);
    drawDynamicQueue('wb', CANVAS_SIZE - 160, centerY - INTERSECTION_SIZE / 2 - 40);
    d.queueLabels = performance.now() - md;
    md = performance.now();

    vehiclesRef.current.forEach(v => {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      if (v.vType === 'MOTORCYCLE') ctx.scale(1.25, 1);

      const lane = LANE_MAP.get(v.laneId);
      const isStopped = Math.abs(v.vx) < 0.1 && Math.abs(v.vy) < 0.1;
      const brakeIntensity = v.brakeIntensity || 0;
      const isBraking = isStopped || brakeIntensity > 0;

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      renderVehicleSprite({
        ctx,
        v,
        lane,
        time,
        isStopped,
        isBraking,
        brakeIntensity,
      });
      const isCrashedVehicle = !!crashInfo && crashInfo.vehicleIds.includes(v.id);
      const shouldFlashCrash = Math.floor(time / 180) % 2 === 0;
      if (isCrashedVehicle && shouldFlashCrash) {
        ctx.strokeStyle = 'rgba(248, 81, 73, 0.95)';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(248, 81, 73, 0.85)';
        ctx.shadowBlur = 14;
        ctx.strokeRect(
          -v.length / 2 - 3,
          -v.width / 2 - 3,
          v.length + 6,
          v.width + 6,
        );
      }

      ctx.restore();
    });
    d.vehicles = performance.now() - md;
    md = performance.now();

    const inspected = inspectPaintRef.current;
    if (inspected) {
      const insLane = LANE_MAP.get(inspected.laneId);
      if (insLane) {
        const geom = getPathGeometry(insLane, centerX, centerY);
        const end = getPathEndPoint(geom);
        ctx.save();
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        if (geom.type === 'STRAIGHT') {
          ctx.moveTo(geom.startX, geom.startY);
          ctx.lineTo(geom.endX, geom.endY);
        } else {
          ctx.arc(geom.centerX, geom.centerY, geom.radius, geom.startAngle, geom.endAngle, geom.counterClockwise);
        }
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(inspected.x, inspected.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Crosswalks (Below Signals)
    const drawCrosswalk = (m: Movement, x: number, y: number, isVertical: boolean) => {
        const isActive = activeMovements.includes(m) && lightState === 'GREEN';
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = isActive ? 'rgba(63, 185, 80, 0.4)' : 'rgba(255, 255, 255, 0.05)';
        if (isVertical) {
            for (let i = -80; i <= 80; i += 20) {
                ctx.fillRect(i, -10, 10, 20);
            }
        } else {
            for (let i = -80; i <= 80; i += 20) {
                ctx.fillRect(-10, i, 20, 10);
            }
        }
        ctx.restore();
    };

    if (!closedDirections.has('N')) {
      drawCrosswalk(Movement.CROSSWALK_NORTH, centerX, centerY - INTERSECTION_SIZE / 2 - 15, true);
    }
    if (!closedDirections.has('S')) {
      drawCrosswalk(Movement.CROSSWALK_SOUTH, centerX, centerY + INTERSECTION_SIZE / 2 + 15, true);
    }
    if (!closedDirections.has('E')) {
      drawCrosswalk(Movement.CROSSWALK_EAST, centerX + INTERSECTION_SIZE / 2 + 15, centerY, false);
    }
    if (!closedDirections.has('W')) {
      drawCrosswalk(Movement.CROSSWALK_WEST, centerX - INTERSECTION_SIZE / 2 - 15, centerY, false);
    }

    // 4. Signal Lights (Top Layer)
    if (!closedDirections.has('N')) {
      drawSignal(centerX + 100, centerY + 130, 0, [Movement.NORTHBOUND_RIGHT]);
      drawSignal(centerX + 60, centerY + 130, 0, [Movement.NORTHBOUND_STRAIGHT]);
      drawSignal(centerX + 20, centerY + 130, 0, [Movement.NORTHBOUND_LEFT], true);
    }
    
    if (!closedDirections.has('S')) {
      drawSignal(centerX - 100, centerY - 130, Math.PI, [Movement.SOUTHBOUND_RIGHT]);
      drawSignal(centerX - 60, centerY - 130, Math.PI, [Movement.SOUTHBOUND_STRAIGHT]);
      drawSignal(centerX - 20, centerY - 130, Math.PI, [Movement.SOUTHBOUND_LEFT], true);
    }
    
    if (!closedDirections.has('E')) {
      drawSignal(centerX - 130, centerY + 100, -Math.PI/2, [Movement.EASTBOUND_RIGHT]);
      drawSignal(centerX - 130, centerY + 60, -Math.PI/2, [Movement.EASTBOUND_STRAIGHT]);
      drawSignal(centerX - 130, centerY + 20, -Math.PI/2, [Movement.EASTBOUND_LEFT], true);
    }
    
    if (!closedDirections.has('W')) {
      drawSignal(centerX + 130, centerY - 100, Math.PI/2, [Movement.WESTBOUND_RIGHT]);
      drawSignal(centerX + 130, centerY - 60, Math.PI/2, [Movement.WESTBOUND_STRAIGHT]);
      drawSignal(centerX + 130, centerY - 20, Math.PI/2, [Movement.WESTBOUND_LEFT], true);
    }
    d.chrome = performance.now() - md;

  }, [activeMovements, lightState, offScreenQueues, bgFontsReady, showHeatmap, yieldMovements, crashInfo, activeLevelId, currentLevel]);

  const updateRef = useRef(update);
  updateRef.current = update;
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const needsRedrawRef = useRef(true);

  const loop = useCallback((time: number) => {
    const tLoop = performance.now();
    let updateMs = 0;
    if (lastTimeRef.current !== null && isPlayingRef.current) {
      const wallDtSec = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      const simStep = wallDtSec * 60 * timeScaleRef.current;
      const u0 = performance.now();
      let remaining = simStep;
      while (remaining > 1e-8) {
        const sub = Math.min(MAX_SIM_INTEGRATION_STEP, remaining);
        updateRef.current(time, sub);
        remaining -= sub;
      }
      updateMs = performance.now() - u0;
    }
    let drawMs = 0;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const d0 = performance.now();
      drawRef.current(ctx, time);
      drawMs = performance.now() - d0;
    }
    const totalMs = performance.now() - tLoop;

    const win = loopTotalMsWindowRef.current;
    win.push(totalMs);
    if (win.length > 10) win.shift();
    const avg10 = win.reduce((a, b) => a + b, 0) / win.length;

    const hudNow = performance.now();
    if (hudNow - loopHudThrottleRef.current >= LOOP_HUD_MIN_INTERVAL_MS) {
      loopHudThrottleRef.current = hudNow;
      setLoopLastMs(totalMs);
      setLoopAvg10Ms(avg10);
    }

    if (totalMs >= LOOP_LAG_LOG_MS) {
      const round = (x: number) => Number(x.toFixed(2));
      const pack = (o: Record<string, number>) =>
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
      console.warn('[gameLoop]', {
        totalMs: round(totalMs),
        updateMs: round(updateMs),
        drawMs: round(drawMs),
        updateSections: pack(loopUpdateSectionsRef.current),
        drawSections: pack(loopDrawSectionsRef.current),
      });
    }

    lastTimeRef.current = time;
    if (isPlayingRef.current || isDraggingCanvasRef.current || needsRedrawRef.current) {
      needsRedrawRef.current = false;
      requestRef.current = requestAnimationFrame(loop);
    } else {
      requestRef.current = null;
    }
  }, []);

  const triggerRedraw = useCallback(() => {
    needsRedrawRef.current = true;
    if (!requestRef.current) {
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  useEffect(() => {
    if (introPhase !== null) return;
    triggerRedraw();
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [triggerRedraw, introPhase]);

  const handlePhaseTimingChange = (phaseIndex: number, val: number) => {
    setPhaseTimings((prev) => {
      const sc = compiledPhases.length > 0 ? compiledPhases.length : 4;
      const next = Array.from({ length: sc }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS);
      next[phaseIndex] = Math.max(MIN_PHASE_GREEN_SECONDS, val);
      return next;
    });
  };

  const getPercentage = () => {
      const sc = compiledPhases.length > 0 ? compiledPhases.length : 4;
      const idx = currentPhase % sc;
      const currentMax = phaseTimings[idx] ?? DEFAULT_PHASE_GREEN_SECONDS;

      if (lightState === 'GREEN') return (timer / Math.max(currentMax, 1)) * 100;
      if (lightState === 'YELLOW') return (timer / DEFAULT_TIMINGS.yellow) * 100;
      return (timer / DEFAULT_TIMINGS.allRed) * 100;
  };

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const togglePlayback = useCallback(() => {
    setIsPlaying((playing) => {
      const next = !playing;
      isPlayingRef.current = next;
      if (next) triggerRedraw();
      return next;
    });
  }, [triggerRedraw]);

  useEffect(() => {
    triggerRedraw();
  }, [zoom, pan, programCode, mobileScreen, isEditMode, currentPhase, triggerRedraw]);

  const dismissIntroSplash = useCallback(() => {
    hapticHeavy();
    playThunk();
    startAtmosphericHum();
    setIntroPhase('home');
  }, []);

  const enterGameFromIntro = useCallback(() => {
    hapticHeavy();
    stopAtmosphericHum();
    setIntroPhase(null);
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const returnToMainMenu = useCallback(() => {
    setIntroPhase('home');
    isPlayingRef.current = false;
    setIsPlaying(false);
    setExecutionSplitActive(false);
    setMobileScreen('briefing');
    inspectPaintRef.current = null;
    setInspectPanel(null);
    setIsOptimizing(false);
  }, []);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const zoomDelta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((z) => Math.max(0.5, Math.min(3, z + zoomDelta)));
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const [p1, p2] = Array.from(activePointersRef.current.values());
      pinchStartDistRef.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      setZoom((currentZoom) => {
        pinchStartZoomRef.current = currentZoom;
        return currentZoom;
      });
      isDraggingCanvasRef.current = false;
    } else if (activePointersRef.current.size === 1) {
      isDraggingCanvasRef.current = true;
      hasDraggedRef.current = false;
      dragStartCanvasRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = pan;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [pan]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointersRef.current.size === 2) {
      const [p1, p2] = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (pinchStartDistRef.current > 0) {
        const ratio = dist / pinchStartDistRef.current;
        setZoom(Math.max(0.5, Math.min(3, pinchStartZoomRef.current * ratio)));
      }
      return;
    }
    
    if (!isDraggingCanvasRef.current) return;
    const dx = e.clientX - dragStartCanvasRef.current.x;
    const dy = e.clientY - dragStartCanvasRef.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDraggedRef.current = true;
    }
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy
    });
  }, []);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
       pinchStartDistRef.current = 0;
    }
    if (activePointersRef.current.size === 0) {
       isDraggingCanvasRef.current = false;
    }
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (hasDraggedRef.current) return;

    const canvas = canvasRef.current;
    const mainEl = simMainRef.current;
    if (!canvas || !mainEl) return;
    const cr = canvas.getBoundingClientRect();
    const px = ((e.clientX - cr.left) / cr.width) * CANVAS_SIZE;
    const py = ((e.clientY - cr.top) / cr.height) * CANVAS_SIZE;

    if (wiringPhaseIndex !== null) {
      let closestLane: Lane | null = null;
      let minDistance = 20;

      for (const lane of LANES) {
        const A = px - lane.startX;
        const B = py - lane.startY;
        const C = lane.endX - lane.startX;
        const D = lane.endY - lane.startY;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) { xx = lane.startX; yy = lane.startY; }
        else if (param > 1) { xx = lane.endX; yy = lane.endY; }
        else { xx = lane.startX + param * C; yy = lane.startY + param * D; }
        
        const dx = px - xx;
        const dy = py - yy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDistance) {
          minDistance = dist;
          closestLane = lane;
        }
      }

      if (closestLane) {
        const dirStr = closestLane.direction === 'N' ? 'NORTH' : closestLane.direction === 'S' ? 'SOUTH' : closestLane.direction === 'E' ? 'EAST' : 'WEST';
        const typeStr = closestLane.type === 'THRU' ? 'STRAIGHT' : closestLane.type;
        const instruction = `    ${dirStr}_${typeStr}.GO`;
        
        setProgramCode(prev => {
          const lines = prev.split('\n');
          let targetLine = wiringPhaseIndex + 1;
          while (targetLine < lines.length && !lines[targetLine].trim().startsWith('phase(') && !lines[targetLine].trim().startsWith('if ')) {
            targetLine++;
          }
          lines.splice(targetLine, 0, instruction);
          return lines.join('\n');
        });
        hapticHeavy();
        addLog('WIRING LINKED', 'var(--green)');
      }
      setWiringPhaseIndex(null);
      return;
    }

    const picked = pickVehicleAtCanvasPoint(px, py, vehiclesRef.current);
    const mr = mainEl.getBoundingClientRect();
    const panelW = 268;
    const panelPad = 8;
    if (picked) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      const snap: Vehicle = { ...picked };
      inspectPaintRef.current = snap;
      const left = Math.max(panelPad, Math.min(e.clientX - mr.left + 12, mr.width - panelW - panelPad));
      const top = Math.max(panelPad, Math.min(e.clientY - mr.top + 12, mr.height - panelPad));
      setInspectPanel({ vehicle: snap, left, top });
      return;
    }
    inspectPaintRef.current = null;
    setInspectPanel(null);
  }, []);

  const startSidebarResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    setIsResizingSidebar(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const nextWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, resizeStartWidthRef.current + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  const phaseRowCount = compiledPhases.length > 0 ? compiledPhases.length : 4;
  const cycleLength = Array.from({ length: phaseRowCount }, (_, i) => phaseTimings[i] ?? DEFAULT_PHASE_GREEN_SECONDS).reduce((a, b) => a + b, 0);
  const sidebarColumnWidth = sidebarCollapsed ? 0 : sidebarWidth;

  const engineeringTemplateBlurb = useMemo(() => {
    if (userTemplate && programCode === userTemplate) {
      return { title: 'CUSTOM', body: 'Phase program stored on this device. Save from the editor to refresh the stored copy.' };
    }
    return { title: '', body: '' };
  }, [programCode, userTemplate]);

  const resetSimulation = useCallback((reason: 'MANUAL' | 'CRASH', autoPlay: boolean = false) => {
    prngRef.current = new PRNG(currentLevel?.randomSeed ?? Date.now());
    vehiclesRef.current = [];
    heatMapRef.current.fill(0);
    skidMarksRef.current = [];
    previousRearTiresRef.current = {};
    crashDetectedRef.current = false;
    setCrashInfo(null);
    setLevelCompleteInfo(null);
    setIsFreeplay(false);
    setIsCrashModalMinimized(false);
    setOffScreenQueues({});
    setSessionCarsCleared(0);
    setSessionCarsByDir({ N: 0, S: 0, E: 0, W: 0 });
    setSessionCrashes(0);
    setSessionTime(0);
    setInjectedPhase(null);
    skipConditionalAfterInjectRef.current = false;
    setCurrentPhase(0);
    setLightState('GREEN');
    setTimer(0);
    inspectPaintRef.current = null;
    setInspectPanel(null);
    isPlayingRef.current = autoPlay;
    setIsPlaying(autoPlay);
    triggerRedraw();
    addLog(reason === 'CRASH' ? 'CRASH RESET' : 'MANUAL RESET', reason === 'CRASH' ? 'var(--red)' : 'var(--minor)');
  }, [addLog, triggerRedraw, currentLevel]);

  const handleSelectLevel = useCallback((levelId: string) => {
    setActiveLevelId(levelId);
    const level = level1Briefing.find(l => l.id === levelId) || level1Briefing[0];
    setProgramCode(level.initialCode);
    resetSimulation('MANUAL');
    setIsOptimizing(false);
  }, [resetSimulation]);

  const applyTemplate = (code: string) => {
    if (!code) return;
    vehiclesRef.current = [];
    previousRearTiresRef.current = {};
    crashDetectedRef.current = false;
    setCrashInfo(null);
    setIsCrashModalMinimized(false);
    setOffScreenQueues({});
    inspectPaintRef.current = null;
    setInspectPanel(null);
    setProgramCode(code);
    compile(code);
    addLog("TEMPLATE_APPLIED", "var(--major)");
  };


  return {
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
  };
}
