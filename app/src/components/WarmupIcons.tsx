/* Fire and thermometer icons for the mailbox warm-up thermometer.
   From Microsoft's Fluent Emoji (Flat style), MIT License, Copyright (c) Microsoft Corporation:
   https://github.com/microsoft/fluentui-emoji (assets/Fire, assets/Thermometer).
   Inline so they look the same on every device, unlike the emoji they replace. Decorative. */

export function FireIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className} style={{ flexShrink: 0 }}>
      <path d="M26 19.3399C26 25.4393 20.9491 30.3451 14.8501 29.981C8.58145 29.6067 4.2892 23.5781 5.09774 17.2765C5.58685 13.4429 7.38361 10.1555 9.34008 7.6065C9.67947 7.16144 10.0288 10.7422 10.3782 10.3477C10.7276 9.94307 13.9717 4.32923 15.0997 2.35679C15.3093 1.99265 15.7884 1.88139 16.1278 2.14438C18.3937 3.85382 26 10.2769 26 19.3399Z" fill="#FF6723" />
      <path d="M23 21.8512C23 25.893 19.4812 29.142 15.2011 28.9952C10.5815 28.8386 7.41254 24.6109 8.09159 20.256C9.06903 14.0124 15.4789 10 15.4789 10C15.4789 10 23 14.7072 23 21.8512Z" fill="#FFB02E" />
    </svg>
  );
}

export function ThermometerIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className} style={{ flexShrink: 0 }}>
      <path d="M21.74 16.08L8.83 3.17C7.27 1.61 4.74 1.61 3.17 3.17C1.61 4.73 1.61 7.26 3.17 8.83L16.08 21.74C15.69 23.92 16.34 26.24 18.02 27.92C20.75 30.65 25.19 30.65 27.92 27.92C30.65 25.19 30.65 20.75 27.92 18.02C26.24 16.34 23.92 15.7 21.74 16.08Z" fill="#F4F4F4" />
      <path d="M4.59 7.42002C3.81 6.64002 3.81 5.37 4.59 4.59C5.37 3.81 6.63 3.81 7.42 4.59L21.1439 18.3139C21.7096 18.0919 22.3255 17.97 22.97 17.97C25.7314 17.97 27.97 20.2085 27.97 22.97C27.97 25.7314 25.7314 27.97 22.97 27.97C20.2085 27.97 17.97 25.7314 17.97 22.97C17.97 22.3255 18.0919 21.7096 18.3139 21.1439L4.59 7.42002Z" fill="#F8312F" />
      <path d="M10.23 4.59998L8.11 6.71997C7.72 7.10997 7.72 7.74997 8.11 8.12997C8.5 8.51997 9.13 8.51997 9.52 8.12997L11.64 6.00998L10.23 4.59998ZM12.35 10.97L14.47 8.84998L15.88 10.26L13.76 12.38C13.37 12.77 12.74 12.77 12.35 12.38C11.96 11.99 11.96 11.36 12.35 10.97ZM16.59 15.21L18.71 13.09L20.12 14.5L18 16.62C17.61 17.01 16.98 17.01 16.59 16.62C16.2 16.23 16.2 15.6 16.59 15.21Z" fill="black" />
      <path d="M24.97 23.97C26.0745 23.97 26.97 23.0745 26.97 21.97C26.97 20.8654 26.0745 19.97 24.97 19.97C23.8654 19.97 22.97 20.8654 22.97 21.97C22.97 23.0745 23.8654 23.97 24.97 23.97Z" fill="#FF8687" />
    </svg>
  );
}
