export function Doodle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 42C20 20 35 15 55 25C75 35 90 22 116 16" stroke="#F49A57" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 52C26 34 44 38 62 44" stroke="#D17B3A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
