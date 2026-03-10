import type { AppendCommand, BackspaceCommand, CreateCommand, DeleteCommand, InsertCommand, MoveBoxCommand, MoveCommand, ReplaceCommand } from "./types";

export function createCmd(x: number, y: number, text: string): CreateCommand {
  return { type: "create", x, y, text };
}

export function appendCmd(boxId: number, text: string): AppendCommand {
  return { type: "append", boxId, text };
}

export function insertCmd(boxId: number, index: number, text: string, expectedText?: string): InsertCommand {
  return { type: "insert", boxId, index, text, expectedText };
}

export function replaceCmd(boxId: number, start: number, end: number, text: string, expectedText?: string): ReplaceCommand {
  return { type: "replace", boxId, start, end, text, expectedText };
}

export function deleteCmd(boxId: number, start: number, end: number, expectedText?: string): DeleteCommand {
  return { type: "delete", boxId, start, end, expectedText };
}

export function backspaceCmd(boxId: number, index: number, count: number, expectedText?: string): BackspaceCommand {
  return { type: "backspace", boxId, index, count, expectedText };
}

export function moveCmd(x: number, y: number): MoveCommand {
  return { type: "move", x, y };
}

export function moveBoxCmd(boxId: number, toX: number, toY: number): MoveBoxCommand {
  return { type: "moveBox", boxId, toX, toY };
}
