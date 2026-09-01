export function isSubmitShortcut(event: {
  key: string;
  repeat?: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean;

export function prefersMetaSubmitHint(platform?: string): boolean;

export function isEligibleSubmitControl(element: object | null): boolean;

export function resolveSubmitForm(element: object | null): object | null;

export function isKeyboardSubmittableForm(form: object | null): boolean;

export function resolveSubmitter(form: { elements: Iterable<object> }): {
  ok: boolean;
  submitter: object | null;
};

export function handleKeyboardSubmit(event: {
  key: string;
  target?: object | null;
  defaultPrevented?: boolean;
  preventDefault: () => void;
  repeat?: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean;

export function initKeyboardSubmit(): void;
