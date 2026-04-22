const fs = require('fs');

function refactorFile(path, replacer) {
  let content = fs.readFileSync(path, 'utf8');
  content = replacer(content);
  fs.writeFileSync(path, content, 'utf8');
}

// 1. useTrafficSimulation.ts
refactorFile('src/useTrafficSimulation.ts', (c) => {
  // Add imports
  c = c.replace(
    "import { parseTrafficProgram, Phase, ConditionalRule, PhaseCommand, KEYWORD_MAP } from './interpreter';",
    "import { parseTrafficProgram, Phase, ConditionalRule, PhaseCommand, KEYWORD_MAP } from './interpreter';\nimport { PRNG } from './utils/prng';\nimport { LevelManager } from './LevelManager';"
  );

  // Replace activeSubLevel state
  c = c.replace(
    "const [activeSubLevel, setActiveSubLevel] = useState(0);",
    "const [activeLevelId, setActiveLevelId] = useState('1A');"
  );
  
  c = c.replace(/activeSubLevel/g, "activeLevelId");

  // Add prng ref
  c = c.replace(
    "const editorRef = useRef<any>(null);",
    "const prngRef = useRef(new PRNG(42));\n  const editorRef = useRef<any>(null);"
  );

  // Replace Math.random with prngRef in traffic logic
  // trafficRates drift
  c = c.replace(
    "const drift = (Math.random() - 0.5) * SPAWN_DRIFT_SPEED;",
    "const drift = (prngRef.current.next() - 0.5) * SPAWN_DRIFT_SPEED;"
  );
  // queue generation
  c = c.replace(
    "if (Math.random() < rate) {",
    "if (prngRef.current.next() < rate) {"
  );
  // spawner r
  c = c.replace(
    "const r = Math.random();",
    "const r = prngRef.current.next();"
  );
  // spawner cruise
  c = c.replace(
    "const cruiseSpeed = spec.cruiseSpeedMin + Math.random() * (spec.cruiseSpeedMax - spec.cruiseSpeedMin);",
    "const cruiseSpeed = spec.cruiseSpeedMin + prngRef.current.next() * (spec.cruiseSpeedMax - spec.cruiseSpeedMin);"
  );
  // spawner legendary
  c = c.replace(
    "legendarySkin = Math.random() < LEGENDARY_SPAWN_CHANCE;",
    "legendarySkin = prngRef.current.next() < LEGENDARY_SPAWN_CHANCE;"
  );
  // spawner rare
  c = c.replace(
    "rareSkin = !legendarySkin && Math.random() < 0.01;",
    "rareSkin = !legendarySkin && prngRef.current.next() < 0.01;"
  );
  // spawner start delay
  c = c.replace(
    "startDelay: 0.1 + Math.random() * 0.3,",
    "startDelay: 0.1 + prngRef.current.next() * 0.3,"
  );

  // Fix currentLevel fetching
  c = c.replace(/level1Briefing\[activeLevelId\]/g, "(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0])");

  // Fix LevelSelect usage
  c = c.replace(
    "const handleSelectLevel = useCallback((idx: number) => {",
    "const handleSelectLevel = useCallback((levelId: string) => {"
  );
  c = c.replace(
    "setActiveLevelId(idx);",
    "setActiveLevelId(levelId);"
  );
  c = c.replace(
    "setProgramCode((level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0])[idx].initialCode);",
    "setProgramCode((level1Briefing.find(l => l.id === levelId) || level1Briefing[0]).initialCode);"
  );
  c = c.replace(
    "setProgramCode((level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).initialCode);",
    "setProgramCode((level1Briefing.find(l => l.id === levelId) || level1Briefing[0]).initialCode);"
  );

  // Fix resetSimulation to seed PRNG
  c = c.replace(
    "const resetSimulation = useCallback((reason: 'MANUAL' | 'CRASH', autoPlay: boolean = false) => {",
    "const resetSimulation = useCallback((reason: 'MANUAL' | 'CRASH', autoPlay: boolean = false) => {\n    const cl = level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0];\n    prngRef.current = new PRNG(cl.randomSeed ?? Date.now());"
  );
  // Add activeLevelId to resetSimulation deps
  c = c.replace(
    "addLog(reason === 'CRASH' ? 'CRASH RESET' : 'MANUAL RESET', reason === 'CRASH' ? 'var(--red)' : 'var(--minor)');\n  }, [addLog]);",
    "addLog(reason === 'CRASH' ? 'CRASH RESET' : 'MANUAL RESET', reason === 'CRASH' ? 'var(--red)' : 'var(--minor)');\n  }, [addLog, activeLevelId]);"
  );

  // Fix level progression unlock
  c = c.replace(
    "if (activeLevelId + 1 < level1Briefing.length) {",
    "if (currentLevel.nextLevelId) {"
  );
  c = c.replace(
    "unlockLevel(activeLevelId + 1);",
    "unlockLevel(currentLevel.nextLevelId);"
  );

  // Use LevelManager for closed lanes in spawner and visual
  c = c.replace(
    "const closed = currentLevel?.closedLanes || [];",
    "const lm = new LevelManager(currentLevel);\n    const closed = currentLevel?.closedLanes || [];"
  );

  return c;
});

// 2. CoreComponents.tsx
refactorFile('src/CoreComponents.tsx', (c) => {
  c = c.replace(
    "export const LevelSelect = ({ levels, activeLevelIndex, unlockedLevels = [], onSelectLevel }: { levels: BriefingContent[]; activeLevelIndex: number; unlockedLevels?: number[]; onSelectLevel: (idx: number) => void; }) => {",
    "export const LevelSelect = ({ levels, activeLevelId, unlockedLevels = [], onSelectLevel }: { levels: BriefingContent[]; activeLevelId: string; unlockedLevels?: string[]; onSelectLevel: (id: string) => void; }) => {"
  );
  c = c.replace(
    "const activeLevel = levels[activeLevelIndex];",
    "const activeLevel = levels.find(l => l.id === activeLevelId) || levels[0];"
  );
  c = c.replace(
    "const isUnlocked = unlockedLevels.includes(i) || i === 0;",
    "const isUnlocked = unlockedLevels.includes(l.id) || i === 0;"
  );
  c = c.replace(
    "onClick={() => isUnlocked && onSelectLevel(i)}",
    "onClick={() => isUnlocked && onSelectLevel(l.id)}"
  );
  c = c.replace(
    "i === activeLevelIndex",
    "l.id === activeLevelId"
  );
  return c;
});

// 3. App.tsx
refactorFile('src/App.tsx', (c) => {
  c = c.replace(
    "activeLevelIndex={activeLevelId}",
    "activeLevelId={activeLevelId}"
  );
  
  // Mobile progression logic
  c = c.replace(
    "if (activeLevelId === level1Briefing.length - 1) {",
    "const cl = level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0];\n                if (!cl.nextLevelId) {"
  );
  c = c.replace(
    "const nextIdx = Math.min(activeLevelId + 1, level1Briefing.length - 1);\n                  setActiveLevelId(nextIdx);\n                  setProgramCode(level1Briefing[nextIdx].initialCode);",
    "const nextId = cl.nextLevelId;\n                  if (nextId) {\n                    setActiveLevelId(nextId);\n                    const nextLvl = level1Briefing.find(l => l.id === nextId);\n                    if (nextLvl) setProgramCode(nextLvl.initialCode);\n                  }"
  );

  // Fix the other level complete onNext
  c = c.replace(
    "if (activeLevelId === level1Briefing.length - 1) {",
    "const cl = level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0];\n                if (!cl.nextLevelId) {"
  );
  c = c.replace(
    "const nextIdx = Math.min(activeLevelId + 1, level1Briefing.length - 1);\n                  setActiveLevelId(nextIdx);\n                  setProgramCode(level1Briefing[nextIdx].initialCode);",
    "const nextId = cl.nextLevelId;\n                  if (nextId) {\n                    setActiveLevelId(nextId);\n                    const nextLvl = level1Briefing.find(l => l.id === nextId);\n                    if (nextLvl) setProgramCode(nextLvl.initialCode);\n                  }"
  );

  // Fix level complete props
  c = c.replace(
    "isLastLevel={activeLevelId === level1Briefing.length - 1}",
    "isLastLevel={!(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).nextLevelId}"
  );
  c = c.replace(
    "isLastLevel={activeLevelId === level1Briefing.length - 1}",
    "isLastLevel={!(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).nextLevelId}"
  );
  c = c.replace(
    "levelId={(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0])?.id}",
    "levelId={activeLevelId}"
  );
  c = c.replace(
    "levelId={(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0])?.id}",
    "levelId={activeLevelId}"
  );
  c = c.replace(
    "closedLanes={(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0])?.closedLanes}",
    "closedLanes={(level1Briefing.find(l => l.id === activeLevelId) || level1Briefing[0]).closedLanes}"
  );
  
  c = c.replace(
    "setActiveSubLevel(idx);",
    "setActiveLevelId(idx);"
  );
  c = c.replace(
    "setProgramCode(level1Briefing[idx].initialCode);",
    "setProgramCode((level1Briefing.find(l => l.id === idx) || level1Briefing[0]).initialCode);"
  );
  c = c.replace(
    "onSelectLevel={(idx) => {",
    "onSelectLevel={(idx) => {"
  );

  return c;
});

console.log("Refactor complete!");