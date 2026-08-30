/**
 * The viewfinder corners: the recurring signature on a primary panel.
 *
 * Shared by the landing page, the host wizard and the lobby — the three
 * screens on the host's path into a game, which read as one production because
 * of this mark. Extracted at the third copy.
 */
export default function HudCorners() {
  const arm = 'pointer-events-none absolute h-4 w-4 border-neon-cyan/70';
  return (
    <>
      <span aria-hidden className={`${arm} -left-1.5 -top-1.5 border-l-2 border-t-2`} />
      <span aria-hidden className={`${arm} -right-1.5 -top-1.5 border-r-2 border-t-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -left-1.5 border-b-2 border-l-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -right-1.5 border-b-2 border-r-2`} />
    </>
  );
}
