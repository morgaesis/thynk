import type { VimMode } from '../extensions/VimModeExtension';

interface Props {
  mode: VimMode;
}

const modeLabel: Record<VimMode, string> = {
  normal: '-- NORMAL --',
  insert: '-- INSERT --',
  visual: '-- VISUAL --',
};

const modeColor: Record<VimMode, string> = {
  normal: 'text-blue-500 dark:text-blue-400',
  insert: 'text-green-600 dark:text-green-400',
  visual: 'text-orange-500 dark:text-orange-400',
};

export function VimStatusBar({ mode }: Props) {
  return (
    <div
      className={`px-3 py-1 text-xs font-mono font-semibold select-none
                  border-t border-border dark:border-border-dark
                  bg-sidebar dark:bg-sidebar-dark ${modeColor[mode]}`}
    >
      {modeLabel[mode]}
    </div>
  );
}
