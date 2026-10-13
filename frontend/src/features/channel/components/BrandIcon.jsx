import React from "react";

export const BrandIcon = ({ type, size = 28, className = "" }) => {
  switch (type?.toLowerCase()) {
    case "meta":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16.96 6.34c-1.42 0-2.73.68-3.72 1.81-.97-1.13-2.29-1.81-3.72-1.81-3.17 0-5.52 2.52-5.52 5.66 0 3.33 2.53 5.66 5.69 5.66 1.68 0 3.03-.84 3.98-2.17.95 1.33 2.3 2.17 3.98 2.17 3.16 0 5.69-2.33 5.69-5.66 0-3.14-2.35-5.66-5.52-5.66h-.86zm-7.44 9.17c-1.97 0-3.56-1.55-3.56-3.51s1.59-3.51 3.56-3.51c1.33 0 2.49.77 3.1 1.89-.99 1.7-2.09 3.52-3.1 5.13zm8.3 0c-1.01-1.61-2.11-3.43-3.1-5.13.61-1.12 1.77-1.89 3.1-1.89 1.97 0 3.56 1.55 3.56 3.51s-1.59 3.51-3.56 3.51z"
            fill="#0081FB"
          />
        </svg>
      );

    case "google":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            fill="#4285F4"
          />
          <path
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.31 24 12 24z"
            fill="#34A853"
          />
          <path
            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
            fill="#FBBC05"
          />
          <path
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            fill="#EA4335"
          />
        </svg>
      );

    case "spotify":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="11.5" fill="#1DB954" />
          <path
            d="M17.5 16.5c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.8-9.3-1-.4.1-.7-.2-.8-.5-.1-.4.2-.7.5-.8 4.1-.9 7.6-.6 10.3 1.1.4.2.4.7.2 1zm1.4-3c-.3.4-.8.5-1.2.3-2.9-1.8-7.3-2.3-10.7-1.3-.5.1-1-.1-1.1-.6-.1-.5.1-1 .6-1.1 4-1.2 8.9-.6 12.1 1.5.4.3.5.8.3 1.2zm.1-3.1c-3.5-2.1-9.3-2.3-12.6-1.3-.5.2-1.1-.1-1.3-.6-.2-.5.1-1.1.6-1.3 3.9-1.2 10.3-1 14.4 1.5.5.3.7.9.4 1.4-.3.4-.9.6-1.5.3z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "linkedin":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="24" height="24" rx="4.5" fill="#0A66C2" />
          <path
            d="M19 19h-3.4v-5.3c0-1.3-.5-2.2-1.7-2.2-1 0-1.5.7-1.8 1.3-.1.2-.1.5-.1.8V19H8.6s.1-9.2 0-10.1H12v1.4c.5-.7 1.3-1.7 3.1-1.7 2.3 0 4 1.5 4 4.6V19zM5.3 7.6c-1.2 0-2-.8-2-1.8 0-1 .8-1.8 2-1.8 1.2 0 2 .8 2 1.8 0 1-.8 1.8-2 1.8zM3.6 19h3.4V8.9H3.6V19z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "taboola":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Taboola Blue Smiley Mark */}
          <circle cx="7.2" cy="8.2" r="3.6" fill="#0073FF" />
          <circle cx="7.2" cy="8.2" r="1.6" fill="#FFFFFF" />
          <circle cx="16.8" cy="8.2" r="3.6" fill="#0073FF" />
          <circle cx="16.8" cy="8.2" r="1.6" fill="#FFFFFF" />
          <path
            d="M4.6 14.2C6.8 18 9.2 19.4 12 19.4s5.2-1.4 7.4-5.2"
            stroke="#0073FF"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "tiktok":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="24" height="24" rx="4.5" fill="#000000" />
          <path
            d="M16.6 8.2c-1-.2-1.8-.8-2.3-1.6v6.9c0 2.5-2 4.5-4.5 4.5S5.3 16 5.3 13.5s2-4.5 4.5-4.5c.3 0 .7.1 1 .2v2.4c-.3-.1-.6-.2-1-.2-1.2 0-2.2 1-2.2 2.2s1 2.2 2.2 2.2 2.2-1 2.2-2.2V4h2.4c.3 1.6 1.6 2.8 3.2 3.1v1.1z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "twitter":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="24" height="24" rx="4.5" fill="#0F1419" />
          <path
            d="M18.2 5h2.9l-6.3 7.2L22 20h-5.8l-4.5-5.9L6.5 20H3.6l6.8-7.8L3 5h5.9l4.1 5.4L18.2 5zm-1 13.3h1.6L8.4 6.6H6.7l10.5 11.7z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "snapchat":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="24" height="24" rx="4.5" fill="#FFFC00" />
          <path
            d="M12 4.5c-2.8 0-4.5 2-4.5 4.3 0 .8.2 1.8.4 2.3-.6.2-1.4.6-1.5 1.4-.1.4.1.8.4.9.4.2 1 .2 1.4.1-.1.4-.4 1.1-.9 1.4-.7.4-1.6.4-1.8.8-.2.4.2.8.7 1 .7.3 1.6.2 2.4.1.3.6.9 1.1 1.7 1.3-.8.4-1.9.8-2.6 1.2-.5.3-.6.7-.4 1 .2.3.7.4 1.3.3 1.1-.2 2.3-.7 3.4-1.7 1.1 1 2.3 1.5 3.4 1.7.6.1 1.1 0 1.3-.3.2-.3.1-.7-.4-1-.7-.4-1.8-.8-2.6-1.2.8-.2 1.4-.7 1.7-1.3.8.1 1.7.2 2.4-.1.5-.2.9-.6.7-1-.2-.4-1.1-.4-1.8-.8-.5-.3-.8-1-.9-1.4.4.1 1 .1 1.4-.1.3-.1.5-.5.4-.9-.1-.8-.9-1.2-1.5-1.4.2-.5.4-1.5.4-2.3 0-2.3-1.7-4.3-4.5-4.3z"
            fill="#000000"
          />
        </svg>
      );

    case "microsoft":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
          <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
          <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
          <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
        </svg>
      );

    case "apple":
    case "apple-music":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="24" height="24" rx="4.5" fill="#FA2D48" />
          <path
            d="M15.5 5.5v9.1c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.4 0 .8.1 1.2.3V7.8l-4.5 1.2v6.6c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9 1.3-2.9 2.9-2.9c.4 0 .8.1 1.2.3V6.8c0-.6.4-1.1 1-1.2l6.5-1.7c.7-.2 1.4.3 1.4 1.1v.5z"
            fill="#FFFFFF"
          />
        </svg>
      );

    case "jiosaavn":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="11.5" fill="#2BB0ED" />
          <path
            d="M12 6.5c-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5S15 6.5 12 6.5zm0 8.5c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z"
            fill="#FFFFFF"
          />
          <circle cx="12" cy="12" r="1.5" fill="#FFFFFF" />
        </svg>
      );

    case "outbrain":
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={className}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="11.5" fill="#EE5220" />
          <path
            d="M12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6c0-1.8-.8-3.4-2.1-4.5l-1.4 1.4c.9.8 1.5 1.9 1.5 3.1 0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4c.6 0 1.1.1 1.6.4l1.1-1.7C13.8 6.3 12.9 6 12 6z"
            fill="#FFFFFF"
          />
        </svg>
      );

    default:
      return (
        <div
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: size * 0.45,
            color: "#64748B",
          }}
        >
          {type?.slice(0, 1).toUpperCase()}
        </div>
      );
  }
};

export default BrandIcon;
