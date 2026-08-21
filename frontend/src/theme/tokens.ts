export const theme = {
  colors: {
    canvas: {
      bg: '#F8FAFC',          // Soft ambient background
      subtle: '#F1F5F9',
    },
    glass: {
      card: 'rgba(255, 255, 255, 0.75)',
      cardHover: 'rgba(255, 255, 255, 0.90)',
      border: 'rgba(255, 255, 255, 0.60)',
      borderSubtle: 'rgba(226, 232, 240, 0.60)',
      blur: 'backdrop-blur-xl',
    },
    brand: {
      googleBlue: '#1A73E8',  // Google primary action
      googleBlueHover: '#1557B0',
      googleBlueLight: '#E8F0FE',
      mint: '#0D9488',        // Teal/Mint active accents
      mintLight: '#E6F7F3',
      dark: '#1E293B',        // Slate-800 text
      muted: '#64748B',       // Slate-500 secondary
      subtle: '#94A3B8',      // Slate-400 placeholders
    },
    bubble: {
      inbound: '#FFFFFF',
      inboundText: '#1E293B',
      outbound: '#E6F4EA',    // Soft Google Mint/Green
      outboundText: '#137333',
    },
    semantic: {
      urgent: { bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA' },
      pending: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
      success: { bg: '#E6F4EA', text: '#137333', border: '#CEEAD6' },
    }
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Cairo", sans-serif',
    headings: 'font-semibold tracking-tight text-slate-800',
    body: 'text-sm text-slate-600 leading-relaxed',
    meta: 'text-xs text-slate-400 font-medium',
  },
  shadows: {
    glass: '0 4px 20px -2px rgba(0, 0, 0, 0.03), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
    floating: '0 10px 30px -4px rgba(0, 0, 0, 0.06), 0 4px 10px -2px rgba(0, 0, 0, 0.03)',
    popover: '0 20px 40px -6px rgba(0, 0, 0, 0.08), 0 8px 16px -4px rgba(0, 0, 0, 0.04)',
  },
  radii: {
    card: 'rounded-2xl',
    pill: 'rounded-full',
    bubble: 'rounded-2xl',
    input: 'rounded-xl',
  }
};
