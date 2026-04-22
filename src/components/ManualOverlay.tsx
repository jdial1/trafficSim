import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ManualOverlay({ isOpen, onClose }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[100] flex justify-center bg-black/80 backdrop-blur-md overflow-hidden p-2 sm:p-8"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-4xl h-full flex flex-col bg-[#efebd8] text-[#2c2b29] rounded-sm shadow-2xl border-4 border-[#2c2b29]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100\' height=\'100\' filter=\'url(%23noise)\' opacity=\'0.05\'/%3E%3C/svg%3E")' }}
          >
            <div className="flex items-center justify-between bg-[#2c2b29] text-[#efebd8] px-4 py-2 font-mono font-bold tracking-widest shrink-0">
              <span>GOSAVTOMATIKA ENGINEERING MANUAL v4.2</span>
              <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 font-serif leading-relaxed text-[15px] sm:text-[16px]">
              <h1 className="text-4xl font-bold font-mono border-b-2 border-[#2c2b29] pb-4 mb-8">SEC-082 NODE PROTOCOL</h1>
              
              <h2 className="text-xl font-bold mt-8 mb-4 border-b border-[#2c2b29]/30 pb-2">1. OVERVIEW</h2>
              <p className="mb-4">
                Welcome to GOSAVTOMATIKA. Your directive is to maintain flow efficiency at highly congested intersections.
                The SEC-082 Node operates using a cyclic phase-based controller. You must divide conflicting movements into separate time phases.
              </p>

              <h2 className="text-xl font-bold mt-8 mb-4 border-b border-[#2c2b29]/30 pb-2">2. SYNTAX & COMMANDS</h2>
              <p className="mb-4">
                The hardware accepts line-by-line commands grouped into blocks.
                Each phase block begins with <code className="bg-[#2c2b29]/10 px-1 font-mono">phase(ID)</code> or <code className="bg-[#2c2b29]/10 px-1 font-mono">phase(ID, min=10, max=40)</code>.
              </p>

              <div className="bg-[#2c2b29]/5 p-4 border-l-4 border-[#2c2b29] font-mono text-sm mb-6">
                NORTH_LEFT.GO<br/>
                SOUTH_LEFT.GO
              </div>

              <h3 className="font-bold text-lg mb-2">2.1 Protected vs Yielding Movements</h3>
              <ul className="list-disc pl-6 mb-6 space-y-2">
                <li>
                  <strong>.GO (Protected):</strong> Assigns an absolute right-of-way. Vehicles using <code className="bg-[#2c2b29]/10 px-1 font-mono">.GO</code> will never stop unless constrained by traffic ahead. 
                  Do NOT group conflicting <code className="bg-[#2c2b29]/10 px-1 font-mono">.GO</code> commands in the same phase, or a fatal CRASH will occur.
                </li>
                <li>
                  <strong>.YIELD (Permissive):</strong> Displays a flashing yellow or yielding green arrow. Vehicles will inch forward and wait for a gap in oncoming <code className="bg-[#2c2b29]/10 px-1 font-mono">.GO</code> traffic.
                  Commonly used for Left turns yielding to opposing Straight traffic, or Right turns yielding to Crosswalks.
                </li>
              </ul>

              <h2 className="text-xl font-bold mt-8 mb-4 border-b border-[#2c2b29]/30 pb-2">3. HARDWARE CAPABILITIES</h2>
              <p className="mb-4">
                The base SEC-082 node supports <strong>NORTH, SOUTH, EAST, WEST</strong> lanes with <strong>LEFT, STRAIGHT, RIGHT</strong> subsets.
                You may also invoke the <code className="bg-[#2c2b29]/10 px-1 font-mono">EXCLUSIVE_PEDESTRIAN_PHASE.GO</code> command to clear all crosswalks at once.
              </p>

              <p className="mb-4 font-bold text-red-800">
                Warning: Do not exceed phase count or conditional logic limits designated by your current clearance directive.
                Hardware failures will result in immediate termination.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
