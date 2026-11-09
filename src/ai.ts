import type { Level, Point } from './level';

/** These bounded contexts are ready for the later AI phase. No provider is connected. */
export interface GameplayState {
  position: Point;
  checkpoint: Point | null;
  elapsedMs: number;
  deaths: number;
  collected: number;
  totalItems: number;
  paused: boolean;
  finished: boolean;
}

export interface GameplayHintContext {
  mode: 'gameplay';
  level: Level;
  state: GameplayState;
}

export interface EditorFeedbackContext {
  mode: 'editor';
  draft: Omit<Level, 'id'>;
}

export interface AiUnavailable {
  status: 'unavailable';
  reason: 'not_implemented';
  message: string;
}

export const AI_UNAVAILABLE_MESSAGE = 'AI assistance is not available yet.';

export function buildGameplayContext(level: Level, state: GameplayState): GameplayHintContext {
  return structuredClone({ mode: 'gameplay' as const, level, state });
}

export function buildEditorContext(draft: Omit<Level, 'id'>): EditorFeedbackContext {
  return structuredClone({ mode: 'editor' as const, draft });
}

export async function requestGameplayHint(_context: GameplayHintContext): Promise<AiUnavailable> {
  return { status: 'unavailable', reason: 'not_implemented', message: AI_UNAVAILABLE_MESSAGE };
}

export async function requestEditorFeedback(_context: EditorFeedbackContext): Promise<AiUnavailable> {
  return { status: 'unavailable', reason: 'not_implemented', message: AI_UNAVAILABLE_MESSAGE };
}
