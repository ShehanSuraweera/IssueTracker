interface NewnopLogoProps {
  className?: string;
  width?: number;
  height?: number;
}

export function NewnopLogo({
  className,
  width = 28,
  height = 24,
}: NewnopLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 27.541 24"
      width={width}
      height={height}
      className={className}
      aria-label="Newnop"
      role="img"
    >
      <path
        d="M 6.087 0.402 C 6.719 0.08 7.48 0.14 8.054 0.558 L 21.187 10.1 C 19.654 12.21 16.702 12.678 14.592 11.145 L 3.542 3.115 C 3.542 3.115 2.453 2.252 1.294 2.842 L 6.086 0.402 Z"
        fill="rgb(0,54,206)"
      />
      <defs>
        <linearGradient
          id="newnop-grad-blue"
          x1="0.131"
          x2="0.869"
          y1="1"
          y2="0"
        >
          <stop offset="0" stopColor="rgb(0,54,206)" />
          <stop offset="1" stopColor="rgb(9,16,53)" />
        </linearGradient>
        <linearGradient
          id="newnop-grad-green"
          x1="0.858"
          x2="0.142"
          y1="0"
          y2="1"
        >
          <stop offset="0" stopColor="rgb(145,217,77)" />
          <stop offset="1" stopColor="rgb(27,150,9)" />
        </linearGradient>
      </defs>
      <path
        d="M 3.542 3.115 C 3.542 3.115 2.453 2.252 1.294 2.842 L 1.281 2.847 C 0.648 3.169 0.249 3.819 0.249 4.529 L 0.249 21.439 C 0.249 22.742 1.306 23.798 2.609 23.798 C 3.912 23.798 4.969 22.742 4.969 21.439 L 4.969 6.007 C 4.969 5.236 5.845 4.791 6.468 5.243 L 3.537 3.115 Z"
        fill="url(#newnop-grad-blue)"
      />
      <path
        d="M 21.327 23.598 C 20.695 23.92 19.934 23.86 19.36 23.442 L 6.224 13.899 C 7.757 11.789 10.709 11.321 12.819 12.855 L 23.871 20.885 C 23.871 20.885 24.96 21.747 26.119 21.157 L 21.33 23.598 Z"
        fill="rgb(145,217,77)"
      />
      <path
        d="M 23.871 20.885 C 23.871 20.885 24.96 21.748 26.119 21.157 L 26.132 21.152 C 26.765 20.831 27.164 20.181 27.164 19.471 L 27.164 2.556 C 27.161 1.252 26.103 0.197 24.799 0.196 C 24.174 0.196 23.573 0.445 23.131 0.887 C 22.688 1.33 22.44 1.93 22.44 2.556 L 22.44 17.99 C 22.44 18.762 21.564 19.206 20.94 18.754 L 23.871 20.882 Z"
        fill="url(#newnop-grad-green)"
      />
    </svg>
  );
}
