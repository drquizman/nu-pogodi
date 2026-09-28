/** Keep button text nodes stable between pointerdown and click. */
export function setText(element: Element, value: string) {
  if (element.textContent !== value) element.textContent = value;
}
