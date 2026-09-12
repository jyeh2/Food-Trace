/** Purely decorative line-art produce icons for the side margins on wide
 * screens — cute hand-drawn-doodle style (small stem/leaf/seed details)
 * rather than plain geometric outlines. */
function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 9c-3.5-1-6.5 1-6.5 5.5S8 21 11 21c.5 0 1-.2 1-.2s.5.2 1 .2c3 0 5.5-2 5.5-6.5S15.5 8 12 9Z" />
      <path d="M12 9c0-2 .5-3.5 2-4.5" />
      <path d="M9.5 5.5c.7.9 1.7 1.3 2.5 1.3" />
    </svg>
  );
}
function CherryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="17" r="3.2" />
      <circle cx="15.5" cy="15" r="3.2" />
      <path d="M8 13.8C8.5 8 10 5 13 3.5M15.5 11.8c0-3 .5-5 1-6.5" />
      <path d="M13 3.5c1 0 2 .3 2.7 1" />
    </svg>
  );
}
function StrawberryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21c4-.5 7-4.5 7-9 0-2-1.5-3-3-2-1-1.5-6-1.5-7 0-1.5-1-3 0-3 2 0 4.5 3 8.5 6 9Z" />
      <path d="M9 8c1-1.5 4-1.5 5 0" />
      <circle cx="10" cy="12" r=".4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="13" r=".4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="16" r=".4" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="17" r=".4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CitrusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 6.5V19.5M5.3 9.5h13.4M5.3 16.5h13.4" />
      <path d="M9.5 5.5c1-1 3.5-1 4.5.5" />
    </svg>
  );
}
function GrapeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3c1.5 0 2.5 1 2.5 2" />
      <path d="M11 4.5c-1.5-1-3 0-3 1" />
      <circle cx="10" cy="8" r="2.3" />
      <circle cx="14" cy="8" r="2.3" />
      <circle cx="8" cy="12" r="2.3" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="16" cy="12" r="2.3" />
      <circle cx="10" cy="16" r="2.3" />
      <circle cx="14" cy="16" r="2.3" />
      <circle cx="12" cy="20" r="2.3" />
    </svg>
  );
}
function LeafIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20c0-8 4-14 12-16-1 7-3 12-12 16Z" />
      <path d="M5.5 18.5c3-4 6-7 9.5-11" />
    </svg>
  );
}

/** Fixed so it sits in the empty gutters beside the centered column, independent
 * of the column's own max-width. Hidden below `lg` since there's no room there.
 * Rendered once in the root layout so it shows on every page. */
export function ProduceDecor() {
  const leftIcons = [
    { Icon: AppleIcon, top: "12%" },
    { Icon: GrapeIcon, top: "38%" },
    { Icon: CitrusIcon, top: "66%" },
  ];
  const rightIcons = [
    { Icon: StrawberryIcon, top: "18%" },
    { Icon: CherryIcon, top: "46%" },
    { Icon: LeafIcon, top: "74%" },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 hidden lg:block" aria-hidden>
      {leftIcons.map(({ Icon, top }, i) => (
        <Icon key={i} className="absolute left-10 h-9 w-9 text-cream-500 opacity-40" style={{ top }} />
      ))}
      {rightIcons.map(({ Icon, top }, i) => (
        <Icon key={i} className="absolute right-10 h-9 w-9 text-cream-500 opacity-40" style={{ top }} />
      ))}
    </div>
  );
}
