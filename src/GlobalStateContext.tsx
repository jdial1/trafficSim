import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type LevelScore = { 
  secondsToClear: number;
  instructionCount: number;
  hardwareCost: number;
};

interface GlobalState {
  unlockedLevels: string[];
  levelSolutions: Record<string, string>;
  highscores: Record<string, LevelScore>;
  user: User | null;
  session: Session | null;
  unlockLevel: (levelId: string) => void;
  saveSolution: (levelId: string, code: string) => void;
  saveHighscore: (levelId: string, score: LevelScore) => void;
}

const GlobalStateContext = createContext<GlobalState | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: React.ReactNode }) {
  const [unlockedLevels, setUnlockedLevels] = useState<string[]>(['1A']);
  const [levelSolutions, setLevelSolutions] = useState<Record<string, string>>({});
  const [highscores, setHighscores] = useState<Record<string, LevelScore>>({});
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('unlocked_levels, username').eq('id', user.id).single().then(({ data, error }) => {
        const username = user.user_metadata?.full_name || user.email?.split('@')[0];
        
        if (error || !data) {
          // Create profile if missing
          supabase.from('profiles').insert({ id: user.id, username, unlocked_levels: ['1A'] }).then();
          setUnlockedLevels(['1A']);
        } else {
          let levels = data.unlocked_levels || ['1A'];
          if (levels.length > 0 && typeof levels[0] === 'number') {
             // Map legacy indices to IDs
             const map = ['1A', '1B', '1C'];
             levels = levels.map((idx: number) => map[idx] || '1A');
             // Update backend
             supabase.from('profiles').update({ unlocked_levels: levels }).eq('id', user.id).then();
          }
          setUnlockedLevels(levels);
          // Update username if missing or changed
          if (!data.username || data.username !== username) {
            supabase.from('profiles').update({ username }).eq('id', user.id).then();
          }
        }
      });
      
      supabase.from('solutions').select('level_id, code').eq('user_id', user.id).then(({ data }) => {
        if (data) {
          const sols = data.reduce((acc, curr) => ({ ...acc, [curr.level_id]: curr.code }), {});
          setLevelSolutions(sols);
        }
      });
      
      supabase.from('scores').select('level_id, seconds_to_clear, instruction_count, hardware_cost').eq('user_id', user.id).then(({ data }) => {
        if (data) {
          const scs = data.reduce((acc, curr) => ({ 
            ...acc, 
            [curr.level_id]: { 
              secondsToClear: curr.seconds_to_clear, 
              instructionCount: curr.instruction_count, 
              hardwareCost: curr.hardware_cost 
            } 
          }), {});
          setHighscores(scs);
        }
      });
    } else {
      try {
        const storedUnlocked = localStorage.getItem('metrocorp_unlocked');
        if (storedUnlocked) {
          let parsed = JSON.parse(storedUnlocked);
          if (parsed.length > 0 && typeof parsed[0] === 'number') {
            const map = ['1A', '1B', '1C'];
            parsed = parsed.map((idx: number) => map[idx] || '1A');
          }
          setUnlockedLevels(parsed);
        }

        const storedSolutions = localStorage.getItem('metrocorp_solutions');
        if (storedSolutions) setLevelSolutions(JSON.parse(storedSolutions));

        const storedScores = localStorage.getItem('metrocorp_scores');
        if (storedScores) setHighscores(JSON.parse(storedScores));
      } catch (e) {
        console.error('Failed to load global state', e);
      }
    }
  }, [user]);

  const unlockLevel = (levelId: string) => {
    setUnlockedLevels((prev) => {
      if (prev.includes(levelId)) return prev;
      const next = [...prev, levelId];
      localStorage.setItem('metrocorp_unlocked', JSON.stringify(next));
      if (user) {
        supabase.from('profiles').update({ unlocked_levels: next }).eq('id', user.id).then();
      }
      return next;
    });
  };

  const saveSolution = (levelId: string, code: string) => {
    setLevelSolutions((prev) => {
      const next = { ...prev, [levelId]: code };
      localStorage.setItem('metrocorp_solutions', JSON.stringify(next));
      if (user) {
        supabase.from('solutions').upsert({ user_id: user.id, level_id: levelId, code }, { onConflict: 'user_id, level_id' }).then();
      }
      return next;
    });
  };

  const saveHighscore = (levelId: string, score: LevelScore) => {
    setHighscores((prev) => {
      const current = prev[levelId];
      if (!current || score.secondsToClear < current.secondsToClear) {
        const next = { ...prev, [levelId]: score };
        localStorage.setItem('metrocorp_scores', JSON.stringify(next));
        if (user) {
          supabase.from('scores').upsert({ 
            user_id: user.id, 
            level_id: levelId, 
            seconds_to_clear: score.secondsToClear,
            instruction_count: score.instructionCount,
            hardware_cost: score.hardwareCost
          }, { onConflict: 'user_id, level_id' }).then();
        }
        return next;
      }
      return prev;
    });
  };

  return (
    <GlobalStateContext.Provider value={{ unlockedLevels, levelSolutions, highscores, user, session, unlockLevel, saveSolution, saveHighscore }}>
      {children}
    </GlobalStateContext.Provider>
  );
}

export function useGlobalState() {
  const context = useContext(GlobalStateContext);
  if (!context) throw new Error('useGlobalState must be used within GlobalStateProvider');
  return context;
}
