import {useRegisterSW} from 'virtual:pwa-register/react';
import {motion, AnimatePresence} from 'motion/react';
import {AlertTriangle, RefreshCw, X} from 'lucide-react';

export function FirmwareUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({});

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <AnimatePresence>
      {(needRefresh || offlineReady) && (
        <motion.div
          initial={{opacity: 0, y: 50}}
          animate={{opacity: 1, y: 0}}
          exit={{opacity: 0, y: 50}}
          className="fixed bottom-6 right-6 z-50 w-80 rounded border border-[#D29922] bg-[#1A1D23] p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-[#D29922]" size={20} />
            <div className="flex-1 font-mono">
              <div className="text-[11px] font-bold tracking-widest text-[#D29922]">
                {needRefresh ? 'FIRMWARE UPDATE AWAITING' : 'OFFLINE MODE ENGAGED'}
              </div>
              <div className="mt-1 text-xs text-[#C9D1D9]">
                {needRefresh
                  ? 'New controller logic is ready. Reboot terminal to apply.'
                  : 'System cached. You can now operate without a network connection.'}
              </div>
              <div className="mt-4 flex gap-2">
                {needRefresh && (
                  <button
                    type="button"
                    onClick={() => updateServiceWorker(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded border border-[#D29922]/50 bg-[#D29922]/20 py-1.5 text-xs text-[#D29922] transition-colors hover:bg-[#D29922]/30"
                  >
                    <RefreshCw size={12} />
                    REBOOT
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="flex flex-1 items-center justify-center gap-2 rounded border border-[#2D333B] bg-black/20 py-1.5 text-xs text-[#C9D1D9] transition-colors hover:bg-white/5"
                >
                  <X size={12} />
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
