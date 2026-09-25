import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hero } from '@/components/home/Hero';

describe('Hero component', () => {
  it('renders protocol pill and canonical headlines from Stitch design', () => {
    render(<Hero />);
    expect(screen.getByText('LIVE LIQUIDITY PROTOCOL V4.2')).toBeInTheDocument();
    expect(screen.getByText('AUTHENTICITY IS THE CULTURE.')).toBeInTheDocument();
    expect(screen.getByText('ARCHIVAL')).toBeInTheDocument();
    expect(screen.getByText('GRAIL VAULT')).toBeInTheDocument();
  });

  it('renders trust metrics correctly', () => {
    render(<Hero />);
    expect(screen.getByText('AUTHENTICATED')).toBeInTheDocument();
    expect(screen.getByText('248K+')).toBeInTheDocument();
    expect(screen.getByText('REPLICA RATE')).toBeInTheDocument();
    expect(screen.getByText('0.00%')).toBeInTheDocument();
    expect(screen.getByText('AVG. DISBURSAL')).toBeInTheDocument();
    expect(screen.getByText('48H')).toBeInTheDocument();
  });

  it('renders featured specimen card', () => {
    render(<Hero />);
    expect(screen.getByText('PHYSICAL SPECIMEN #9084')).toBeInTheDocument();
    expect(screen.getByText("A/X PROTOTYPE RUNNER 'ACID VOID'")).toBeInTheDocument();
    expect(screen.getByText('$2,840')).toBeInTheDocument();
  });
});
