export const MARKDOWN_COMMANDS: readonly {
  cmd: string;
  glyph: string;
  label: string;
  hint: string;
}[];

export function applyMarkdownCommand(
  textarea: {
    value: string;
    selectionStart: number | null;
    selectionEnd: number | null;
    setSelectionRange: (start: number, end: number) => void;
    dispatchEvent: (event: unknown) => boolean;
    focus: () => void;
  },
  command: string,
): boolean;

export function enhanceMarkdownEditor(textarea: object): boolean;
export function initMarkdownEditors(root?: object): void;
