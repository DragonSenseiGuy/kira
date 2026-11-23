export function mathSource(element) {
  return element.getAttribute("data-katex-source") ??
    element.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
}
