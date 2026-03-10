export interface Point {
  x: number;
  y: number;
}

export interface Box {
  id: number;
  doc: { text: string; read(): { text: string }; apply(start: number, end: number, insert: string): number };
  el: HTMLDivElement;
  textEl: HTMLDivElement;
  overlayEl: HTMLDivElement;
}

export interface BoxElement extends HTMLDivElement {
  _box?: Box;
}

export interface EditEvent {
  boxId: number;
  start?: number;
  end?: number;
  text?: string;
  newPos?: number;
}

export interface EventMap {
  edit: EditEvent;
}

export interface EventBus {
  on<K extends keyof EventMap>(event: K, fn: (data: EventMap[K]) => void): () => void;
  off<K extends keyof EventMap>(event: K, fn: (data: EventMap[K]) => void): void;
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;
}

export interface CreateCommand {
  type: "create";
  x: number;
  y: number;
  text: string;
}

export interface AppendCommand {
  type: "append";
  boxId: number;
  text: string;
}

export interface InsertCommand {
  type: "insert";
  boxId: number;
  index: number;
  text: string;
  expectedText?: string;
}

export interface ReplaceCommand {
  type: "replace";
  boxId: number;
  start: number;
  end: number;
  text: string;
  expectedText?: string;
}

export interface DeleteCommand {
  type: "delete";
  boxId: number;
  start: number;
  end: number;
  expectedText?: string;
}

export interface BackspaceCommand {
  type: "backspace";
  boxId: number;
  index: number;
  count: number;
  expectedText?: string;
}

export interface MoveCommand {
  type: "move";
  x: number;
  y: number;
}

export interface MoveBoxCommand {
  type: "moveBox";
  boxId: number;
  toX: number;
  toY: number;
}

export type Command = CreateCommand | AppendCommand | InsertCommand | ReplaceCommand | DeleteCommand | BackspaceCommand | MoveCommand | MoveBoxCommand;

export interface PlanResult {
  cmd: Command;
  boxId: number | null;
}

export interface BotContext {
  boxes: Box[];
  cursorLayer: HTMLElement;
  charW: number;
  wsRect: () => DOMRect;
  createBox: (x: number, y: number, text: string) => Box;
  eventBus: EventBus;
}

export type Precision = "travel" | "click" | "text" | "normal";

export interface CursorAgent {
  x: number;
  y: number;
  retiring: boolean;
  lockSpan: HTMLSpanElement | null;
  updateCursor(): void;
  setMode(mode: "arrow" | "ibeam"): void;
  showCaret(box: Box, index: number): void;
  showSelection(box: Box, start: number, end: number): void;
  _renderCaret(box: Box, index: number): void;
  _renderSel(box: Box, start: number, end: number): void;
}
