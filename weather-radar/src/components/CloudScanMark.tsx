type CloudScanMarkProps = {
  className?: string;
};

/** Compact radar-sweep mark for header / favicon parity. */
export default function CloudScanMark({ className = "h-5 w-5" }: CloudScanMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <path
        d="M16 16 L16 3 A13 13 0 0 1 27.5 20.5 Z"
        fill="currentColor"
        fillOpacity="0.85"
      />
      <circle cx="16" cy="16" r="1.75" fill="currentColor" />
    </svg>
  );
}
