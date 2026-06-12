import { useState } from "react";
import { ChevronDown, ChevronUp, Piano as PianoIcon } from "lucide-react";
import { VirtualKeyboard } from "./VirtualKeyboard";

export function VirtualKeyboardSection() {
  const [keyboardVisible, setKeyboardVisible] = useState(true);

  return (
    <div className="shrink-0 border-t border-border-main">
      <button
        onClick={() => setKeyboardVisible((v) => !v)}
        className="w-full h-5 bg-bg-surface hover:bg-bg-surface/80 flex items-center justify-center gap-1.5 transition-colors group"
        title={keyboardVisible ? "Hide keyboard" : "Show keyboard"}
      >
        <PianoIcon size={9} className="text-neutral-600 group-hover:text-neutral-400" />
        <span className="text-xs font-bold text-neutral-600 group-hover:text-neutral-400 uppercase tracking-wider">
          {keyboardVisible ? "Hide" : "Show"} Keyboard
        </span>
        {keyboardVisible ? <ChevronDown size={9} className="text-neutral-600 group-hover:text-neutral-400" /> : <ChevronUp size={9} className="text-neutral-600 group-hover:text-neutral-400" />}
      </button>
      {keyboardVisible && (
        <div className="h-32 bg-bg-main px-3 py-2">
          <VirtualKeyboard />
        </div>
      )}
    </div>
  );
}
