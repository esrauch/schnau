/**
 * Dev builds only: show errors (thrown, rejected, or logged with
 * console.error, like WebGL shader failures) on screen, so problems on a phone
 * can be read without a remote debugger.
 */
export function installErrorOverlay(): void {
  const box = document.createElement('pre');
  Object.assign(box.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    top: '0',
    margin: '0',
    padding: '8px',
    maxHeight: '60vh',
    overflow: 'auto',
    background: 'rgba(120, 0, 20, 0.92)',
    color: 'white',
    font: '12px/1.3 monospace',
    whiteSpace: 'pre-wrap',
    zIndex: '1000',
    pointerEvents: 'auto',
    display: 'none',
  });
  const show = (text: string): void => {
    if (!box.isConnected) document.body.append(box);
    box.style.display = 'block';
    box.textContent += `${text}\n\n`;
  };
  window.addEventListener('error', (e) => show(`${e.message}\n${e.error?.stack ?? ''}`));
  window.addEventListener('unhandledrejection', (e) => show(`Unhandled: ${String(e.reason)}`));
  const error = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    error(...args);
    show(args.map(String).join(' ').slice(0, 2000));
  };
}
