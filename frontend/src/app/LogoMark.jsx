export const LogoMark = ({ size = 36, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`logo-mark ${className}`}
  >
    <rect width="100" height="100" rx="30" fill="#1B2130" />
    {/* Top-Left Chevron */}
    <path
      d="M24 48L46 25L57 29"
      stroke="white"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Center L-shape */}
    <path
      d="M32 49H54V71"
      stroke="white"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Bottom-Right Chevron */}
    <path
      d="M52 77L74 53L70 44"
      stroke="white"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default LogoMark;
