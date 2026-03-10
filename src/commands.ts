import type { AppendCommand, BackspaceCommand, CreateCommand, DeleteCommand, InsertCommand, MoveBoxCommand, MoveCommand, ReplaceCommand } from "./types";

export function createCmd(x: number, y: number, text: string): CreateCommand {
  return { type: "create", x, y, text };
}

export function appendCmd(boxId: number, text: string): AppendCommand {
  return { type: "append", boxId, text };
}

export function insertCmd(boxId: number, index: number, text: string): InsertCommand {
  return { type: "insert", boxId, index, text };
}

export function replaceCmd(boxId: number, start: number, end: number, text: string): ReplaceCommand {
  return { type: "replace", boxId, start, end, text };
}

export function deleteCmd(boxId: number, start: number, end: number): DeleteCommand {
  return { type: "delete", boxId, start, end };
}

export function backspaceCmd(boxId: number, index: number, count: number): BackspaceCommand {
  return { type: "backspace", boxId, index, count };
}

export function moveCmd(x: number, y: number): MoveCommand {
  return { type: "move", x, y };
}

export function moveBoxCmd(boxId: number, toX: number, toY: number): MoveBoxCommand {
  return { type: "moveBox", boxId, toX, toY };
}
