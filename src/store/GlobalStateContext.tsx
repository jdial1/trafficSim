import React, { createContext, useContext, useState, useEffect } from 'react';

type LevelScore = { 
  secondsToClear: number;
  instructionCount: number;
  hardwareCost: number;
};

interface GlobalState {
  unlockedLevels: number[];
  levelSolutions: Record<string, string>;
  highscores: Record<string, LevelScore>;
  unlockLevel: (index: number) => void;
  saveSolution: (levelId: string, code: string) => void;
  saveHighscore: (levelId: string, score: LevelScore) => void;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [unlockedLevels, setUnlockedLevels] = useState<number[]>([0]);
  const [levelSolutions, setLevelSolutions] = useState<Record<string, string>>({});
  const [highscores, setHighscores] = useState<Record<string, LevelScore>>({});

  useEffect(() => {
    try {
      const storedUnlocked = localStorage.getItem('metrocorp_unlocked');
      if (storedUnlocked) setUnlockedLevels(JSON.parse(storedUnlocked));

      const storedSolutions = localStorage.getItem('metrocorp_solutions');
      if (storedSolutions) setLevelSolutions(JSON.parse(storedSolutions));

      const storedScores = localStorage.getItem('metrocorp_scores');
      if (storedScores) setHighscores(JSON.parse(storedScores));
    } catch (e) {
      console.error('Failed to load global state', e);
    }
  }, []);

  const unlockLevel = (index: number) => {
    setUnlockedLevels((prev) => {
      if (prev.includes(index)) return prev;
      const next = [...prev, index];
      localStorage.setItem('metrocorp_unlocked', JSON.stringify(next));
      return next;
    });
  };

  const saveSolution = (levelId: string, code: string) => {
    setLevelSolutions((prev) => {
      const next = { ...prev, [levelId]: code };
      localStorage.setItem('metrocorp_solutions', JSON.stringify(next));
      return next;
    });
  };

  const saveHighscore = (levelId: string, score: LevelScore) => {
    setHighscores((prev) => {
      const current = prev[levelId];
      if (!current || score.secondsToClear < current.secondsToClear) {
        const next = { ...prev, [levelId]: score };
        localStorage.setItem('metrocorp_scores', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  };

  return (
    <GlobalStateContext.Provider value={{ unlockedLevels, levelSolutions, highscores, unlockLevel, saveSolution, saveHighscore }}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (!context) throw new Error('useGlobalState must be used within GlobalStateProvider');
  return context;
}
