export type Turn = { role: 'q' | 'a'; text: string };
export type Step = 'ask' | 'await' | 'done';
export const MAX_DEPTH: number;
export const OPENING_QUESTION: string;
export function depthOf(transcript: Turn[]): number;
export function nextStep(transcript: Turn[]): Step;
export function sanitizeQuestion(raw: string): string;
export function buildPrompt(transcript: Turn[]): { system: string; user: string };
export function isRootHotkey(ev: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; targetTag?: string; targetEditable?: boolean }): boolean;
